import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import { RequestContext } from "@mastra/core/request-context";
import type {
  AgentRuntimeEvent,
  GenerateAgentCommand,
  StreamAgentCommand,
} from "@orbit/runtime-contracts";
import { defineAgentRuntimePortContract } from "../../../harness/runtime-ports/agent-contract.js";
import {
  MastraAgentRuntimeAdapter,
  type MastraAgentExecutionResolver,
  type MastraAgentExecutor,
} from "../../../../src/mastra/adapters/agent-runtime-adapter.js";

const baseCommand: GenerateAgentCommand = {
  agentId: "agent-1",
  agentVersion: "v1",
  sessionId: "session-1",
  resourceId: "resource-1",
  threadId: "thread-1",
  messages: [{ role: "user", content: "hello" }],
  requestContext: { ownerId: "owner-1", apiKey: "request-secret" },
  policy: {
    allowedToolIds: ["read_file"],
    allowedSkillIds: ["review"],
  },
};

function streamFrom(chunks: unknown[]): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

function successfulExecutor(): MastraAgentExecutor {
  return {
    generate: vi.fn().mockImplementation(async (_messages, options) => ({
      runId: options.runId,
      text: "generated",
      finishReason: "stop",
      totalUsage: { inputTokens: 4, outputTokens: 3, totalTokens: 7 },
      toolCalls: [{ payload: { toolCallId: "call-1", toolName: "read_file", args: { path: "README.md" } } }],
      toolResults: [{ payload: { toolCallId: "call-1", toolName: "read_file", result: { ok: true } } }],
    })),
    stream: vi.fn().mockImplementation(async (_messages, options) => ({
      runId: options.runId,
      fullStream: streamFrom([
        { type: "text-delta", payload: { text: "hello" } },
        { type: "tool-call-delta", payload: { toolCallId: "call-1", toolName: "read_file", argsTextDelta: "{\"path\":" } },
        { type: "tool-call", payload: { toolCallId: "call-1", toolName: "read_file", args: { path: "README.md" } } },
        { type: "tool-result", payload: { toolCallId: "call-1", toolName: "read_file", result: { ok: true } } },
        { type: "finish", payload: { stepResult: { reason: "stop" }, output: { usage: { inputTokens: 4, outputTokens: 3, totalTokens: 7 } } } },
      ]),
      text: Promise.resolve("hello"),
      finishReason: Promise.resolve("stop"),
      totalUsage: Promise.resolve({ inputTokens: 4, outputTokens: 3, totalTokens: 7 }),
    })),
    abortRunStream: vi.fn().mockReturnValue(true),
  };
}

function resolver(executor: MastraAgentExecutor): MastraAgentExecutionResolver {
  return {
    sessionMemory: true,
    resolve: vi.fn().mockResolvedValue({
      executor,
      executionOptions: {
        requestContext: new RequestContext(),
        activeTools: ["read_file"],
        memory: { resource: "mastra-resource-1", thread: "mastra-thread-1" },
      },
      finalizeUsage: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

defineAgentRuntimePortContract("Mastra", async () => {
  const executor = successfulExecutor();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const cancellable: MastraAgentExecutor = {
    generate: vi.fn().mockImplementation(async (_messages, options) => {
      await new Promise<void>((resolve) => {
        options.abortSignal?.addEventListener("abort", () => resolve(), { once: true });
      });
      await blocked;
      return {
        runId: options.runId,
        text: "",
        finishReason: "tripwire",
        totalUsage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
        toolCalls: [],
        toolResults: [],
      };
    }),
    stream: vi.fn(),
    abortRunStream: vi.fn().mockImplementation(() => {
      release();
      return true;
    }),
  };
  const routedResolver = resolver(executor);
  routedResolver.resolve = vi.fn().mockImplementation((command) => resolver(
    command.runId === "running-run" ? cancellable : executor,
  ).resolve(command, {
    mastraResourceId: command.resourceId,
    mastraThreadId: command.threadId,
  }));
  const port = new MastraAgentRuntimeAdapter({
    resolver: routedResolver,
    persistenceEnabled: false,
    nativeRunId: (() => {
      let id = 0;
      return () => `native-${++id}`;
    })(),
  });
  return {
    port,
    generateCommand: baseCommand,
    streamCommand: baseCommand as StreamAgentCommand,
    async seedRunningRun() {
      const runId = "running-run";
      void port.generate({ ...baseCommand, runId });
      await delay(0);
      return runId;
    },
  };
});

describe("mastra/adapters/agent-runtime-adapter", () => {
  it("将 Mastra tripwire 映射为结构化 failed 结果", async () => {
    const executor = successfulExecutor();
    executor.generate = vi.fn().mockImplementation(async (_messages, options) => ({
      runId: options.runId,
      text: "blocked request-secret",
      finishReason: "tripwire",
      totalUsage: { inputTokens: 2, outputTokens: 0, totalTokens: 2 },
      toolCalls: [],
      toolResults: [],
      tripwire: { reason: "policy rejected request-secret", metadata: { apiKey: "tripwire-secret" } },
    }));
    const port = new MastraAgentRuntimeAdapter({ resolver: resolver(executor), persistenceEnabled: false });

    const result = await port.generate({ ...baseCommand, runId: "tripwire-run" });

    expect(result).toMatchObject({
      status: "failed",
      error: { code: "MASTRA_AGENT_TRIPWIRE", message: "policy rejected [REDACTED]" },
    });
    expect(JSON.stringify(result)).not.toContain("tripwire-secret");
    expect(result.text).toBe("blocked [REDACTED]");
  });

  it("按 sinceId 回放产品事件且不重复启动 Mastra run", async () => {
    const executor = successfulExecutor();
    const port = new MastraAgentRuntimeAdapter({ resolver: resolver(executor), persistenceEnabled: false });
    const original: AgentRuntimeEvent[] = [];
    for await (const event of port.stream({ ...baseCommand, runId: "replay-run" })) original.push(event);
    const replayed: AgentRuntimeEvent[] = [];
    for await (const event of port.stream({ ...baseCommand, runId: "replay-run", sinceId: 2 })) replayed.push(event);

    expect(replayed.every((event) => event.id > 2)).toBe(true);
    expect(replayed.at(-1)?.type).toBe("run.final");
    expect(executor.stream).toHaveBeenCalledTimes(1);
  });

  it("stream 订阅断开只释放订阅，不自动取消底层运行", async () => {
    let finishStream!: () => void;
    const gate = new Promise<void>((resolve) => { finishStream = resolve; });
    const executor = successfulExecutor();
    executor.stream = vi.fn().mockImplementation(async (_messages, options) => ({
      runId: options.runId,
      fullStream: {
        async *[Symbol.asyncIterator]() {
          yield { type: "text-delta", payload: { text: "first request-secret" } };
          await gate;
          yield { type: "finish", payload: { stepResult: { reason: "stop" }, output: { usage: { totalTokens: 1 } } } };
        },
      },
      text: Promise.resolve("first request-secret"),
      finishReason: Promise.resolve("stop"),
      totalUsage: Promise.resolve({ totalTokens: 1 }),
    }));
    const port = new MastraAgentRuntimeAdapter({ resolver: resolver(executor), persistenceEnabled: false });
    const iterator = port.stream({ ...baseCommand, runId: "disconnect-run" })[Symbol.asyncIterator]();
    await iterator.next();
    await iterator.return?.();
    finishStream();
    await delay(10);

    expect(executor.abortRunStream).not.toHaveBeenCalled();
    await expect(port.getRun("disconnect-run")).resolves.toMatchObject({ status: "succeeded" });
  });

  it("在产品事件与结果边界脱敏 instructions、Tool 数据和凭据", async () => {
    const executor = successfulExecutor();
    executor.stream = vi.fn().mockImplementation(async (_messages, options) => ({
      runId: options.runId,
      fullStream: streamFrom([
        { type: "text-delta", payload: { text: "safe request-secret" } },
        {
          type: "tool-call",
          payload: {
            toolCallId: "call-secret",
            toolName: "secret_tool",
            args: { apiKey: "tool-secret", nested: { password: "p@ss" } },
          },
        },
        {
          type: "tool-result",
          payload: {
            toolCallId: "call-secret",
            toolName: "secret_tool",
            result: { credentials: { token: "result-secret" }, ok: true },
          },
        },
        { type: "finish", payload: { stepResult: { reason: "stop" }, output: { usage: { totalTokens: 1 } } } },
      ]),
      text: Promise.resolve("safe request-secret"),
      finishReason: Promise.resolve("stop"),
      totalUsage: Promise.resolve({ totalTokens: 1 }),
    }));
    const port = new MastraAgentRuntimeAdapter({ resolver: resolver(executor), persistenceEnabled: false });
    const events: AgentRuntimeEvent[] = [];
    for await (const event of port.stream({ ...baseCommand, runId: "redaction-run" })) events.push(event);

    expect(JSON.stringify(events)).not.toContain("tool-secret");
    expect(JSON.stringify(events)).not.toContain("result-secret");
    expect(JSON.stringify(events)).not.toContain("p@ss");
    expect(JSON.stringify(events)).not.toContain("request-secret");
    expect(JSON.stringify(events)).toContain("[REDACTED]");
  });

  it("Mastra Agent 原生流崩溃后保留已提交事件并明确收敛 failed", async () => {
    const executor = successfulExecutor();
    executor.stream = vi.fn().mockImplementation(async (_messages, options) => ({
      runId: options.runId,
      fullStream: {
        async *[Symbol.asyncIterator]() {
          yield { type: "text-delta", payload: { text: "partial" } };
          throw new Error("provider stream crashed");
        },
      },
      text: Promise.resolve("partial"),
      finishReason: Promise.resolve("error"),
      totalUsage: Promise.resolve({ totalTokens: 1 }),
    }));
    const port = new MastraAgentRuntimeAdapter({ resolver: resolver(executor), persistenceEnabled: false });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of port.stream({ ...baseCommand, runId: "crash-run" })) events.push(event);

    expect(events.some((event) => event.type === "text.delta" && event.delta === "partial")).toBe(true);
    expect(events.at(-1)).toMatchObject({
      type: "run.final",
      result: {
        status: "failed",
        error: { code: "MASTRA_AGENT_EXECUTION_FAILED", message: "provider stream crashed" },
      },
    });
    await expect(port.getRun("crash-run")).resolves.toMatchObject({ status: "failed" });
  });
});
