import { Body, Controller, Get, Inject, Param, Post, Put, Res } from "@nestjs/common";
import type { ServerResponse } from "node:http";
import { errorPayload, writeJson } from "../http-utils.js";
import { SkillRegistryService } from "./skill-registry.service.js";
import type { SkillPackageInput } from "./skill-types.js";

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
        writeJson(res, 404, errorPayload("SKILL_NOT_FOUND", `skill ${skillId} was not found or could not be downloaded`));
        return;
      }
      writeJson(res, 200, { ok: true, skill });
    } catch (error) {
      writeJson(res, 400, errorPayload("SKILL_DOWNLOAD_FAILED", error instanceof Error ? error.message : String(error)));
    }
  }

  /** Uploads a custom skill package after validation. */
  @Post("upload")
  async uploadSkill(@Body() body: SkillPackageInput, @Res() res: ServerResponse): Promise<void> {
    const result = await this.skillRegistryService.uploadCustomSkill(body);
    if ("errors" in result) {
      writeJson(res, 400, errorPayload("SKILL_PACKAGE_INVALID", "skill package is invalid", { errors: result.errors }));
      return;
    }
    writeJson(res, 201, { ok: true, skill: result });
  }

  /** Installs one downloaded, builtin, or custom skill by id. */
  @Post(":skillId/install")
  async installSkill(@Param("skillId") skillId: string, @Res() res: ServerResponse): Promise<void> {
    const skill = await this.skillRegistryService.installSkill(skillId);
    if (!skill) {
      writeJson(res, 404, errorPayload("SKILL_NOT_FOUND", `skill ${skillId} was not found`));
      return;
    }
    writeJson(res, 200, { ok: true, skill });
  }

  /** Uninstalls one local skill by id while keeping the package locally available. */
  @Post(":skillId/uninstall")
  async uninstallSkill(@Param("skillId") skillId: string, @Res() res: ServerResponse): Promise<void> {
    const skill = await this.skillRegistryService.uninstallSkill(skillId);
    if (!skill) {
      writeJson(res, 404, errorPayload("SKILL_NOT_FOUND", `skill ${skillId} was not found`));
      return;
    }
    writeJson(res, 200, { ok: true, skill });
  }
}
