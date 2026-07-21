import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, Res } from "@nestjs/common";
import type { ServerResponse } from "node:http";
import { errorPayload, writeJson } from "../http-utils.js";
import { SopDomainError, SopValidationError } from "./sops.errors.js";
import { SopsService } from "./sops.service.js";
import type { PublishSopInput, SaveSopDraftInput } from "./sops.types.js";

async function respond(res: ServerResponse, statusCode: number, action: () => unknown | Promise<unknown>): Promise<void> {
  try {
    writeJson(res, statusCode, { ok: true, data: await action() });
  } catch (error) {
    if (error instanceof SopDomainError) {
      writeJson(res, error.statusCode, errorPayload(error.code, error.message, error.metadata));
      return;
    }
    writeJson(res, 500, errorPayload("SOP_INTERNAL_ERROR", error instanceof Error ? error.message : String(error)));
  }
}

function integer(value: string | undefined, label: string): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new SopValidationError(`${label} 必须是非负整数。 `);
  return parsed;
}

/** SOP 草稿、发布版本、导入导出和存储维护 REST 入口。 */
@Controller("/api/sops")
export class SopsController {
  constructor(@Inject(SopsService) private readonly service: SopsService) {}

  @Get("storage/health")
  health(@Res() res: ServerResponse): Promise<void> {
    return respond(res, 200, () => this.service.storageHealth());
  }

  @Post("storage/backup")
  backup(@Body() body: { label?: string }, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 201, async () => ({ fileName: await this.service.backup(body?.label) }));
  }

  @Post("storage/restore")
  restore(@Body() body: { fileName?: string }, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 200, async () => {
      if (!body?.fileName) throw new SopValidationError("fileName 不能为空。 ");
      await this.service.restore(body.fileName);
      return this.service.storageHealth();
    });
  }

  @Post("import/preview")
  previewImport(@Body() body: { draft?: unknown }, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 200, () => this.service.previewImport(body?.draft ?? body));
  }

  @Post("import")
  importDraft(@Body() body: { draft?: unknown }, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 201, () => this.service.importDraft(body?.draft ?? body));
  }

  @Get()
  list(@Res() res: ServerResponse): Promise<void> {
    return respond(res, 200, () => this.service.listDrafts());
  }

  @Post()
  create(@Body() body: { draft?: unknown }, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 201, () => this.service.createDraft(body?.draft ?? body));
  }

  @Get(":id/export")
  exportDraft(@Param("id") id: string, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 200, () => this.service.exportDraft(id));
  }

  @Post(":id/publish")
  publish(@Param("id") id: string, @Body() body: PublishSopInput, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 201, () => this.service.publish(id, body));
  }

  @Get(":id/versions")
  versions(@Param("id") id: string, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 200, () => this.service.listVersions(id));
  }

  @Get(":id/versions/:versionId/diff")
  diff(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Query("to") to: string | undefined,
    @Res() res: ServerResponse,
  ): Promise<void> {
    return respond(res, 200, () => {
      if (!to) throw new SopValidationError("diff 的 to 版本不能为空。 ");
      return this.service.diffVersions(id, versionId, to);
    });
  }

  @Post(":id/versions/:versionId/drafts")
  draftFromVersion(@Param("id") id: string, @Param("versionId") versionId: string, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 201, () => this.service.createDraftFromVersion(id, versionId));
  }

  @Get(":id/versions/:versionId")
  version(@Param("id") id: string, @Param("versionId") versionId: string, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 200, () => this.service.getVersion(id, versionId));
  }

  @Get(":id")
  get(@Param("id") id: string, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 200, () => this.service.getDraft(id));
  }

  @Put(":id")
  save(@Param("id") id: string, @Body() body: SaveSopDraftInput, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 200, () => this.service.saveDraft(id, body));
  }

  @Post(":id/autosave")
  autosave(@Param("id") id: string, @Body() body: SaveSopDraftInput, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 200, () => this.service.saveDraft(id, body));
  }

  @Delete(":id")
  delete(@Param("id") id: string, @Query("revision") revision: string | undefined, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 200, () => {
      this.service.deleteDraft(id, integer(revision, "revision"));
      return { id };
    });
  }
}
