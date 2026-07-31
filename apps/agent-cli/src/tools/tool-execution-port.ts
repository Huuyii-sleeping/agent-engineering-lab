import {
  RuntimePortError,
  type ExecuteToolCommand,
  type MemoryMessage,
  type MemoryRuntimePort,
  type RuntimePortErrorCode,
  type ToolDescriptor,
  type ToolExecutionPort,
  type ToolExecutionResult,
  type ToolListContext,
} from "@orbit/runtime-contracts";
import { executeProtectedToolHandler } from "../runtime/tool-runtime.js";
import type { ToolRegistration } from "./protocol.js";

export type ToolExecutionServiceLike = {
  listToolRegistrations(): Promise<ToolRegistration[]>;
  runToolByName(name: string, argumentsJson: string): Promise<string>;
};

const MEMORY_TOOL_IDS = new Set([
  "memory_add",
  "memory_search",
  "memory_list",
  "memory_explain",
  "memory_doctor",
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function positiveLimit(value: unknown, fallback = 20): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100) : fallback;
}

function messageText(message: MemoryMessage): string {
  return typeof message.content === "string" ? message.content : JSON.stringify(message.content);
}

function descriptor(registration: ToolRegistration): ToolDescriptor {
  return {
    id: registration.name,
    name: registration.name,
    description: registration.description,
    inputSchema: registration.parameters,
    source: registration.target === "mcp" ? "mcp" : "builtin",
    traits: {
      readOnly: registration.execution.readOnly,
      idempotent: registration.execution.readOnly,
      cancellable: false,
      sideEffecting: registration.execution.mutatesWorkspace || !registration.execution.readOnly,
    },
  };
}

function parseOutput(output: string): unknown {
  try {
    return JSON.parse(output) as unknown;
  } catch {
    return output;
  }
}

function errorCode(error: unknown): RuntimePortErrorCode {
  const code = (error as { code?: unknown })?.code;
  if (
    code === "TOOL_PERMISSION_DENIED" ||
    code === "TOOL_APPROVAL_REQUIRED" ||
    code === "TOOL_SECURITY_BLOCKED" ||
    code === "TOOL_NOT_FOUND" ||
    code === "RUNTIME_CANCELLED" ||
    code === "RUNTIME_NOT_FOUND" ||
    code === "RUNTIME_TERMINAL_CONFLICT" ||
    code === "RUNTIME_OWNERSHIP_CONFLICT" ||
    code === "RUNTIME_CAPABILITY_UNSUPPORTED"
  ) {
    return code;
  }
  return "TOOL_EXECUTION_FAILED";
}

/** 将 Orbit ToolService 的权限、安全、审批和审计执行链路暴露为稳定 ToolExecutionPort。 */
export class ToolServiceExecutionPort implements ToolExecutionPort {
  constructor(
    private readonly service: ToolExecutionServiceLike,
    private readonly memory?: MemoryRuntimePort,
  ) {}

  async list(context: ToolListContext): Promise<ToolDescriptor[]> {
    const allowed = context.allowedToolIds ? new Set(context.allowedToolIds) : null;
    return (await this.service.listToolRegistrations())
      .filter((registration) => !allowed || allowed.has(registration.name))
      .map(descriptor);
  }

  async execute(command: ExecuteToolCommand): Promise<ToolExecutionResult> {
    if (command.abortSignal?.aborted) {
      throw new RuntimePortError("RUNTIME_CANCELLED", `Tool ${command.toolId} 已取消。`);
    }
    const startedAt = Date.now();
    const rawArguments = command.requestContext.argumentsJson;
    const argumentsJson = typeof rawArguments === "string"
      ? rawArguments
      : JSON.stringify(command.input ?? {});
    const execution = MEMORY_TOOL_IDS.has(command.toolId)
      ? this.executeMemoryTool(command)
      : this.service.runToolByName(command.toolId, argumentsJson);
    try {
      const output = command.abortSignal
        ? await Promise.race([
            execution,
            new Promise<never>((_resolve, reject) => {
              const abort = () => reject(
                new RuntimePortError("RUNTIME_CANCELLED", `Tool ${command.toolId} 已取消。`),
              );
              command.abortSignal!.addEventListener("abort", abort, { once: true });
            }),
          ])
        : await execution;
      const parsed = parseOutput(output);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as {
          ok?: unknown;
          error?: { code?: unknown; message?: unknown; details?: unknown };
        };
        if (record.ok === false && record.error) {
          const details = record.error.details && typeof record.error.details === "object"
            ? record.error.details as Record<string, unknown>
            : {};
          throw new RuntimePortError(
            errorCode(record.error),
            String(record.error.message ?? `Tool ${command.toolId} 执行失败。`),
            { ...details, rawOutput: output },
          );
        }
      }
      return { toolId: command.toolId, output: parsed, startedAt, finishedAt: Date.now() };
    } catch (error) {
      if (error instanceof RuntimePortError) throw error;
      throw new RuntimePortError(
        errorCode(error),
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async executeMemoryTool(command: ExecuteToolCommand): Promise<string> {
    if (!this.memory) {
      throw new RuntimePortError(
        "RUNTIME_CAPABILITY_UNSUPPORTED",
        "Mastra MemoryRuntimePort 未装配。",
      );
    }
    const input = record(command.input);
    const threadId = command.executor.sessionId
      ?? (typeof input.thread_id === "string" ? input.thread_id : undefined)
      ?? (typeof command.requestContext.threadId === "string" ? command.requestContext.threadId : undefined);
    if (!threadId) {
      throw new RuntimePortError(
        "RUNTIME_CAPABILITY_UNSUPPORTED",
        `Tool ${command.toolId} 需要 session/thread 上下文。`,
      );
    }
    const resourceId = typeof command.requestContext.resourceId === "string"
      ? command.requestContext.resourceId
      : `session:${threadId}`;
    const ownership = { ownerId: command.ownerId, resourceId, threadId };
    const readOnly = command.toolId !== "memory_add";
    return executeProtectedToolHandler({
      name: command.toolId,
      args: input,
      allowDuringReplay: readOnly,
      handler: async () => {
        try {
          await this.memory!.createThread({
            id: threadId,
            ownerId: command.ownerId,
            resourceId,
            metadata: { source: "agent-session" },
          });
          if (command.toolId === "memory_add") {
            const content = String(input.content ?? "").trim();
            if (!content) {
              return JSON.stringify({
                ok: false,
                error: { code: "INVALID_MEMORY_CONTENT", message: "content is required" },
              });
            }
            await this.memory!.appendMessages({
              ...ownership,
              messages: [{
                role: "system",
                content,
                metadata: {
                  type: input.type,
                  tags: input.tags,
                  confidence: input.confidence,
                },
              }],
            });
            return JSON.stringify({ ok: true, threadId, resourceId });
          }
          const page = await this.memory!.listMessages({
            ...ownership,
            limit: positiveLimit(input.limit, command.toolId === "memory_doctor" ? 100 : 20),
          });
          const query = String(input.query ?? "").trim().toLowerCase();
          const matched = query
            ? page.items.filter((message) => messageText(message).toLowerCase().includes(query))
            : page.items;
          if (command.toolId === "memory_doctor") {
            return JSON.stringify({
              ok: true,
              backend: "mastra",
              threadId,
              resourceId,
              messageCount: page.items.length,
            });
          }
          if (command.toolId === "memory_explain") {
            return JSON.stringify({
              ok: true,
              query,
              matches: matched.map((message) => ({
                id: message.id,
                role: message.role,
                content: message.content,
                reason: "current-thread message contains query text",
              })),
            });
          }
          return JSON.stringify({ ok: true, entries: matched });
        } catch (error) {
          if (error instanceof RuntimePortError) {
            return JSON.stringify({
              ok: false,
              error: { code: error.code, message: error.message, details: error.details },
            });
          }
          throw error;
        }
      },
    });
  }
}
