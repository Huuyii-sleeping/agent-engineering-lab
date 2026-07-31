import {
  RuntimePortError,
  type MemoryMessage,
  type MemoryRuntimePort,
  type MemoryThread,
} from "@orbit/runtime-contracts";
import { describe, expect, it, vi } from "vitest";
import type { ToolRegistration } from "../../../src/tools/protocol.js";

const protectedHandler = vi.hoisted(() => vi.fn(async (options: {
  args: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<string>;
}) => options.handler(options.args)));

vi.mock("../../../src/runtime/tool-runtime.js", () => ({
  executeProtectedToolHandler: protectedHandler,
}));

import { ToolServiceExecutionPort } from "../../../src/tools/tool-execution-port.js";

const registration: ToolRegistration = {
  name: "echo",
  description: "Echo input",
  parameters: { type: "object", properties: { text: { type: "string" } } },
  target: "base",
  allowDuringReplay: true,
  execution: {
    readOnly: true,
    mutatesWorkspace: false,
    parallelSafe: true,
    riskLevel: "low",
  },
};

class MemoryPort implements MemoryRuntimePort {
  private readonly threads = new Map<string, MemoryThread>();
  private readonly messages = new Map<string, MemoryMessage[]>();
  private messageId = 0;

  async createThread(command: Parameters<MemoryRuntimePort["createThread"]>[0]) {
    const id = command.id ?? "thread-1";
    const existing = this.threads.get(id);
    if (existing) {
      this.assertOwnership(existing, command);
      return existing;
    }
    const thread: MemoryThread = {
      id,
      ownerId: command.ownerId,
      resourceId: command.resourceId,
      title: command.title,
      metadata: command.metadata ?? {},
      createdAt: 1,
      updatedAt: 1,
    };
    this.threads.set(id, thread);
    this.messages.set(id, []);
    return thread;
  }

  async getThread(query: Parameters<MemoryRuntimePort["getThread"]>[0]) {
    const thread = this.threads.get(query.threadId) ?? null;
    if (thread) this.assertOwnership(thread, query);
    return thread;
  }

  async listThreads(query: Parameters<MemoryRuntimePort["listThreads"]>[0]) {
    return {
      items: [...this.threads.values()].filter(
        (thread) => thread.ownerId === query.ownerId && thread.resourceId === query.resourceId,
      ),
      nextCursor: null,
    };
  }

  async deleteThread(command: Parameters<MemoryRuntimePort["deleteThread"]>[0]) {
    const thread = await this.getThread(command);
    if (!thread) return;
    this.threads.delete(thread.id);
    this.messages.delete(thread.id);
  }

  async listMessages(query: Parameters<MemoryRuntimePort["listMessages"]>[0]) {
    const thread = await this.getThread(query);
    if (!thread) throw new RuntimePortError("RUNTIME_NOT_FOUND", "thread missing");
    return { items: this.messages.get(thread.id) ?? [], nextCursor: null };
  }

  async appendMessages(command: Parameters<MemoryRuntimePort["appendMessages"]>[0]) {
    const thread = await this.getThread(command);
    if (!thread) throw new RuntimePortError("RUNTIME_NOT_FOUND", "thread missing");
    const target = this.messages.get(thread.id) ?? [];
    target.push(...command.messages.map((message) => ({
      ...message,
      id: message.id ?? `message-${++this.messageId}`,
      threadId: thread.id,
      resourceId: thread.resourceId,
      createdAt: message.createdAt ?? this.messageId,
    })));
    this.messages.set(thread.id, target);
  }

  private assertOwnership(thread: MemoryThread, ownership: { ownerId: string; resourceId: string }) {
    if (thread.ownerId !== ownership.ownerId || thread.resourceId !== ownership.resourceId) {
      throw new RuntimePortError("RUNTIME_OWNERSHIP_CONFLICT", "thread ownership conflict");
    }
  }
}

function memoryCommand(toolId: string, input: Record<string, unknown>, ownerId = "owner-1", resourceId = "resource-1") {
  return {
    toolId,
    input,
    ownerId,
    executor: { kind: "agent" as const, sessionId: "thread-1" },
    requestContext: { resourceId, threadId: "thread-1" },
  };
}

describe("tools/tool-execution-port", () => {
  it("maps ToolService registrations and respects allowedToolIds", async () => {
    const port = new ToolServiceExecutionPort({
      listToolRegistrations: vi.fn(async () => [registration]),
      runToolByName: vi.fn(),
    });

    await expect(port.list({ ownerId: "owner-1", allowedToolIds: ["echo"] })).resolves.toEqual([
      expect.objectContaining({
        id: "echo",
        source: "builtin",
        traits: { readOnly: true, idempotent: true, cancellable: false, sideEffecting: false },
      }),
    ]);
    await expect(port.list({ ownerId: "owner-1", allowedToolIds: [] })).resolves.toEqual([]);
  });

  it("delegates normal Tool execution, parses output, and honors an already-aborted signal", async () => {
    const runToolByName = vi.fn(async () => JSON.stringify({ ok: true, echoed: "hello" }));
    const port = new ToolServiceExecutionPort({
      listToolRegistrations: vi.fn(async () => [registration]),
      runToolByName,
    });

    await expect(port.execute({
      toolId: "echo",
      input: { ignored: true },
      ownerId: "owner-1",
      executor: { kind: "direct" },
      requestContext: { argumentsJson: "{\"text\":\"hello\"}" },
    })).resolves.toMatchObject({ toolId: "echo", output: { ok: true, echoed: "hello" } });
    expect(runToolByName).toHaveBeenCalledWith("echo", "{\"text\":\"hello\"}");

    const controller = new AbortController();
    controller.abort();
    await expect(port.execute({
      toolId: "echo",
      input: {},
      ownerId: "owner-1",
      executor: { kind: "direct" },
      requestContext: {},
      abortSignal: controller.signal,
    })).rejects.toMatchObject({ code: "RUNTIME_CANCELLED" });
    expect(runToolByName).toHaveBeenCalledTimes(1);
  });

  it("preserves the original Tool output in rawOutput for structured failures", async () => {
    const rawOutput = JSON.stringify({
      ok: false,
      error: { code: "TOOL_SECURITY_BLOCKED", message: "blocked", details: { rule: "deny" } },
    });
    const port = new ToolServiceExecutionPort({
      listToolRegistrations: vi.fn(async () => [registration]),
      runToolByName: vi.fn(async () => rawOutput),
    });

    await expect(port.execute({
      toolId: "echo",
      input: {},
      ownerId: "owner-1",
      executor: { kind: "direct" },
      requestContext: {},
    })).rejects.toMatchObject({
      code: "TOOL_SECURITY_BLOCKED",
      details: { rule: "deny", rawOutput },
    });
  });

  it("uses one MemoryRuntimePort thread for add/search/list/explain/doctor through the protected handler", async () => {
    protectedHandler.mockClear();
    const memory = new MemoryPort();
    const port = new ToolServiceExecutionPort({
      listToolRegistrations: vi.fn(async () => [registration]),
      runToolByName: vi.fn(),
    }, memory);

    await expect(port.execute(memoryCommand("memory_add", { content: "Mastra owns memory" }))).resolves.toMatchObject({
      output: { ok: true, threadId: "thread-1", resourceId: "resource-1" },
    });
    await expect(port.execute(memoryCommand("memory_search", { query: "mastra" }))).resolves.toMatchObject({
      output: { ok: true, entries: [expect.objectContaining({ content: "Mastra owns memory" })] },
    });
    await expect(port.execute(memoryCommand("memory_list", {}))).resolves.toMatchObject({
      output: { ok: true, entries: [expect.objectContaining({ content: "Mastra owns memory" })] },
    });
    await expect(port.execute(memoryCommand("memory_explain", { query: "memory" }))).resolves.toMatchObject({
      output: { ok: true, matches: [expect.objectContaining({ reason: expect.stringContaining("current-thread") })] },
    });
    await expect(port.execute(memoryCommand("memory_doctor", {}))).resolves.toMatchObject({
      output: { ok: true, backend: "mastra", messageCount: 1 },
    });
    expect(protectedHandler).toHaveBeenCalledTimes(5);
  });

  it("surfaces Memory ownership conflicts instead of converting them to generic Tool failures", async () => {
    const memory = new MemoryPort();
    const port = new ToolServiceExecutionPort({
      listToolRegistrations: vi.fn(async () => [registration]),
      runToolByName: vi.fn(),
    }, memory);

    await port.execute(memoryCommand("memory_add", { content: "owner one" }));
    await expect(port.execute(memoryCommand("memory_list", {}, "owner-2", "resource-2"))).rejects.toMatchObject({
      code: "RUNTIME_OWNERSHIP_CONFLICT",
      message: "thread ownership conflict",
    });
  });
});
