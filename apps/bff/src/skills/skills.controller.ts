import { Body, Controller, Get, Inject, Param, Post, Put, Res } from "@nestjs/common";
import type { ServerResponse } from "node:http";
import { errorPayload, writeJson } from "../http-utils.js";
import { SkillLifecycleConflictError, SkillRegistryService } from "./skill-registry.service.js";
import type { SkillPackageInput } from "./skill-types.js";

function writeLifecycleError(res: ServerResponse, error: unknown): boolean {
  if (!(error instanceof SkillLifecycleConflictError)) {
    return false;
  }
  writeJson(
    res,
    409,
    errorPayload("SKILL_LIFECYCLE_BUSY", error.message, {
      current: error.current,
    }),
  );
  return true;
}

@Controller("/api/skills")
export class SkillsController {
  constructor(
    @Inject(SkillRegistryService)
    private readonly skillRegistryService: SkillRegistryService,
  ) {}

  /** Lists known skill packages with source and lifecycle state. */
  @Get()
  async skills(@Res() res: ServerResponse): Promise<void> {
    writeJson(res, 200, { ok: true, skills: await this.skillRegistryService.listSkills() });
  }

  /** Lists recent successful Skill lifecycle audit events. */
  @Get("audit")
  async auditEvents(@Res() res: ServerResponse): Promise<void> {
    writeJson(res, 200, { ok: true, events: await this.skillRegistryService.listAuditEvents() });
  }

  /** Returns SkillHub production readiness summary. */
  @Get("readiness")
  async readiness(@Res() res: ServerResponse): Promise<void> {
    writeJson(res, 200, { ok: true, readiness: await this.skillRegistryService.getReadiness() });
  }

  /** Returns remote registry URL and sync status. */
  @Get("registry")
  async registry(@Res() res: ServerResponse): Promise<void> {
    writeJson(res, 200, { ok: true, registry: await this.skillRegistryService.getRemoteRegistrySettings() });
  }

  /** Updates the remote registry URL used for future syncs and downloads. */
  @Put("registry")
  async updateRegistry(@Body() body: unknown, @Res() res: ServerResponse): Promise<void> {
    const url =
      body && typeof body === "object" && !Array.isArray(body) && typeof (body as { url?: unknown }).url === "string"
        ? (body as { url: string }).url
        : "";
    writeJson(res, 200, { ok: true, registry: await this.skillRegistryService.updateRemoteRegistryUrl(url) });
  }

  /** Synchronizes the configured remote registry index into the local cache. */
  @Post("registry/sync")
  async syncRegistry(@Res() res: ServerResponse): Promise<void> {
    try {
      writeJson(res, 200, { ok: true, registry: await this.skillRegistryService.syncRemoteRegistry() });
    } catch (error) {
      writeJson(
        res,
        502,
        errorPayload("REMOTE_REGISTRY_SYNC_FAILED", error instanceof Error ? error.message : String(error)),
      );
    }
  }

  /** Downloads one remote skill into the local skill store. */
  @Post(":skillId/download")
  async downloadSkill(@Param("skillId") skillId: string, @Res() res: ServerResponse): Promise<void> {
    try {
      const skill = await this.skillRegistryService.downloadSkill(skillId);
      if (!skill) {
        const message = `skill ${skillId} was not found or could not be downloaded`;
        await this.skillRegistryService.auditFailure("download", skillId, "SKILL_NOT_FOUND", message);
        writeJson(res, 404, errorPayload("SKILL_NOT_FOUND", message));
        return;
      }
      writeJson(res, 200, { ok: true, skill });
    } catch (error) {
      if (writeLifecycleError(res, error)) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      await this.skillRegistryService.auditFailure("download", skillId, "SKILL_DOWNLOAD_FAILED", message);
      writeJson(res, 400, errorPayload("SKILL_DOWNLOAD_FAILED", message));
    }
  }

  /** Uploads a custom skill package after validation. */
  @Post("upload")
  async uploadSkill(@Body() body: SkillPackageInput, @Res() res: ServerResponse): Promise<void> {
    try {
      const result = await this.skillRegistryService.uploadCustomSkill(body);
      if ("errors" in result) {
        writeJson(res, 400, errorPayload("SKILL_PACKAGE_INVALID", "skill package is invalid", { errors: result.errors }));
        return;
      }
      writeJson(res, 201, { ok: true, skill: result });
    } catch (error) {
      if (writeLifecycleError(res, error)) {
        return;
      }
      throw error;
    }
  }

  /** Installs one downloaded, builtin, or custom skill by id. */
  @Post(":skillId/install")
  async installSkill(@Param("skillId") skillId: string, @Body() body: unknown, @Res() res: ServerResponse): Promise<void> {
    const version =
      body && typeof body === "object" && !Array.isArray(body) && typeof (body as { version?: unknown }).version === "string"
        ? (body as { version: string }).version
        : undefined;
    try {
      const skill = await this.skillRegistryService.installSkill(skillId, version);
      if (!skill) {
        const message = `skill ${skillId} was not found`;
        await this.skillRegistryService.auditFailure("install", skillId, "SKILL_NOT_FOUND", message);
        writeJson(res, 404, errorPayload("SKILL_NOT_FOUND", message));
        return;
      }
      writeJson(res, 200, { ok: true, skill });
    } catch (error) {
      if (writeLifecycleError(res, error)) {
        return;
      }
      throw error;
    }
  }

  /** Updates one installed remote skill to the newest available version. */
  @Post(":skillId/update")
  async updateSkill(@Param("skillId") skillId: string, @Res() res: ServerResponse): Promise<void> {
    try {
      const skill = await this.skillRegistryService.updateSkill(skillId);
      if (!skill) {
        const message = `skill ${skillId} has no installable update`;
        await this.skillRegistryService.auditFailure("update", skillId, "SKILL_UPDATE_NOT_AVAILABLE", message);
        writeJson(res, 404, errorPayload("SKILL_UPDATE_NOT_AVAILABLE", message));
        return;
      }
      writeJson(res, 200, { ok: true, skill });
    } catch (error) {
      if (writeLifecycleError(res, error)) {
        return;
      }
      throw error;
    }
  }

  /** Rolls one installed skill back to the previous local version. */
  @Post(":skillId/rollback")
  async rollbackSkill(@Param("skillId") skillId: string, @Res() res: ServerResponse): Promise<void> {
    try {
      const skill = await this.skillRegistryService.rollbackSkill(skillId);
      if (!skill) {
        const message = `skill ${skillId} has no local rollback target`;
        await this.skillRegistryService.auditFailure("rollback", skillId, "SKILL_ROLLBACK_NOT_AVAILABLE", message);
        writeJson(res, 404, errorPayload("SKILL_ROLLBACK_NOT_AVAILABLE", message));
        return;
      }
      writeJson(res, 200, { ok: true, skill });
    } catch (error) {
      if (writeLifecycleError(res, error)) {
        return;
      }
      throw error;
    }
  }

  /** Uninstalls one local skill by id while keeping the package locally available. */
  @Post(":skillId/uninstall")
  async uninstallSkill(@Param("skillId") skillId: string, @Res() res: ServerResponse): Promise<void> {
    try {
      const skill = await this.skillRegistryService.uninstallSkill(skillId);
      if (!skill) {
        const message = `skill ${skillId} was not found`;
        await this.skillRegistryService.auditFailure("uninstall", skillId, "SKILL_NOT_FOUND", message);
        writeJson(res, 404, errorPayload("SKILL_NOT_FOUND", message));
        return;
      }
      writeJson(res, 200, { ok: true, skill });
    } catch (error) {
      if (writeLifecycleError(res, error)) {
        return;
      }
      throw error;
    }
  }
}
