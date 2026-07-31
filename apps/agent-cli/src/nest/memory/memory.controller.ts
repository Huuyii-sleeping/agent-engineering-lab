import { Body, Controller, Delete, Get, Inject, Param, Post, Query, Res } from "@nestjs/common";
import type { ServerResponse } from "node:http";
import type { AppendMemoryMessagesCommand, MemoryRuntimePort } from "@orbit/runtime-contracts";
import { parsePositiveLimit, writeJson } from "../http.js";
import { MEMORY_RUNTIME_PORT } from "../tokens.js";

type MemoryOwnershipInput = {
  owner_id?: string;
  resource_id?: string;
};

function ownership(input: MemoryOwnershipInput): { ownerId: string; resourceId: string } {
  const ownerId = String(input.owner_id ?? "").trim();
  const resourceId = String(input.resource_id ?? "").trim();
  if (!ownerId || !resourceId) throw new Error("owner_id and resource_id are required");
  return { ownerId, resourceId };
}

@Controller("memory/threads")
export class MemoryController {
  constructor(@Inject(MEMORY_RUNTIME_PORT) private readonly runtime: MemoryRuntimePort) {}

  @Post()
  async create(
    @Body() body: MemoryOwnershipInput & { id?: string; title?: string; metadata?: Record<string, unknown> },
    @Res() res: ServerResponse,
  ): Promise<void> {
    try {
      const thread = await this.runtime.createThread({
        ...ownership(body),
        id: body.id,
        title: body.title,
        metadata: body.metadata,
      });
      writeJson(res, 201, { ok: true, thread });
    } catch (error) {
      writeJson(res, 400, { ok: false, error: { code: "MEMORY_REQUEST_INVALID", message: String(error instanceof Error ? error.message : error) } });
    }
  }

  @Get()
  async list(
    @Query("owner_id") ownerId: string | undefined,
    @Query("resource_id") resourceId: string | undefined,
    @Query("cursor") cursor: string | undefined,
    @Query("limit") limit: string | undefined,
    @Res() res: ServerResponse,
  ): Promise<void> {
    try {
      const page = await this.runtime.listThreads({
        ...ownership({ owner_id: ownerId, resource_id: resourceId }),
        cursor,
        limit: parsePositiveLimit(limit),
      });
      writeJson(res, 200, { ok: true, ...page });
    } catch (error) {
      writeJson(res, 400, { ok: false, error: { code: "MEMORY_REQUEST_INVALID", message: String(error instanceof Error ? error.message : error) } });
    }
  }

  @Get(":threadId")
  async get(
    @Param("threadId") threadId: string,
    @Query("owner_id") ownerId: string | undefined,
    @Query("resource_id") resourceId: string | undefined,
    @Res() res: ServerResponse,
  ): Promise<void> {
    try {
      const thread = await this.runtime.getThread({
        ...ownership({ owner_id: ownerId, resource_id: resourceId }),
        threadId,
      });
      writeJson(res, thread ? 200 : 404, thread
        ? { ok: true, thread }
        : { ok: false, error: { code: "MEMORY_THREAD_NOT_FOUND", message: `memory thread not found: ${threadId}` } });
    } catch (error) {
      writeJson(res, 400, { ok: false, error: { code: "MEMORY_REQUEST_INVALID", message: String(error instanceof Error ? error.message : error) } });
    }
  }

  @Delete(":threadId")
  async delete(
    @Param("threadId") threadId: string,
    @Query("owner_id") ownerId: string | undefined,
    @Query("resource_id") resourceId: string | undefined,
    @Res() res: ServerResponse,
  ): Promise<void> {
    try {
      await this.runtime.deleteThread({
        ...ownership({ owner_id: ownerId, resource_id: resourceId }),
        threadId,
      });
      writeJson(res, 200, { ok: true });
    } catch (error) {
      writeJson(res, 400, { ok: false, error: { code: "MEMORY_REQUEST_INVALID", message: String(error instanceof Error ? error.message : error) } });
    }
  }

  @Get(":threadId/messages")
  async messages(
    @Param("threadId") threadId: string,
    @Query("owner_id") ownerId: string | undefined,
    @Query("resource_id") resourceId: string | undefined,
    @Query("cursor") cursor: string | undefined,
    @Query("limit") limit: string | undefined,
    @Res() res: ServerResponse,
  ): Promise<void> {
    try {
      const page = await this.runtime.listMessages({
        ...ownership({ owner_id: ownerId, resource_id: resourceId }),
        threadId,
        cursor,
        limit: parsePositiveLimit(limit),
      });
      writeJson(res, 200, { ok: true, ...page });
    } catch (error) {
      writeJson(res, 400, { ok: false, error: { code: "MEMORY_REQUEST_INVALID", message: String(error instanceof Error ? error.message : error) } });
    }
  }

  @Post(":threadId/messages")
  async append(
    @Param("threadId") threadId: string,
    @Body() body: MemoryOwnershipInput & { messages?: AppendMemoryMessagesCommand["messages"] },
    @Res() res: ServerResponse,
  ): Promise<void> {
    try {
      await this.runtime.appendMessages({
        ...ownership(body),
        threadId,
        messages: body.messages ?? [],
      });
      writeJson(res, 202, { ok: true });
    } catch (error) {
      writeJson(res, 400, { ok: false, error: { code: "MEMORY_REQUEST_INVALID", message: String(error instanceof Error ? error.message : error) } });
    }
  }
}
