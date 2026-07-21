import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, Res } from "@nestjs/common";
import type { ServerResponse } from "node:http";
import { errorPayload, writeJson } from "../http-utils.js";
import { SopDomainError, SopValidationError } from "./sops.errors.js";
import { SopsService } from "./sops.service.js";
import type { SaveSopTemplateInput } from "./sops.types.js";

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

/** 版本化 SOP 模板 REST 入口。 */
@Controller("/api/sop-templates")
export class SopTemplatesController {
  constructor(@Inject(SopsService) private readonly service: SopsService) {}

  @Get()
  list(@Res() res: ServerResponse): Promise<void> {
    return respond(res, 200, () => this.service.listTemplates());
  }

  @Post()
  create(@Body() body: SaveSopTemplateInput, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 201, () => this.service.saveTemplate(body));
  }

  @Get(":id")
  get(@Param("id") id: string, @Query("version") version: string | undefined, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 200, () => {
      const parsed = version === undefined ? undefined : Number(version);
      if (parsed !== undefined && (!Number.isInteger(parsed) || parsed < 1)) throw new SopValidationError("模板 version 必须是正整数。 ");
      return this.service.getTemplate(id, parsed);
    });
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() body: SaveSopTemplateInput, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 201, () => this.service.saveTemplate({ ...body, id }));
  }

  @Post(":id/drafts")
  createDraft(
    @Param("id") id: string,
    @Query("version") version: string | undefined,
    @Body() body: { parameters?: unknown },
    @Res() res: ServerResponse,
  ): Promise<void> {
    return respond(res, 201, () => {
      const parsed = version === undefined ? undefined : Number(version);
      if (parsed !== undefined && (!Number.isInteger(parsed) || parsed < 1)) throw new SopValidationError("模板 version 必须是正整数。 ");
      return this.service.createDraftFromTemplate(id, parsed, body?.parameters);
    });
  }

  @Delete(":id")
  delete(@Param("id") id: string, @Res() res: ServerResponse): Promise<void> {
    return respond(res, 200, () => {
      this.service.deleteTemplate(id);
      return { id };
    });
  }
}
