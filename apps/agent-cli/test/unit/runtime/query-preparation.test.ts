import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../../src/runtime/query-notifications.js", () => ({
  collectDynamicSystemMessages: vi.fn(async () => []),
}));

import type { AgentRuntimeState } from "../../../src/agent-loop.js";
import type { HookServiceLike } from "../../../src/services/hook-service.js";
import type { MemoryServiceLike } from "../../../src/services/memory-service.js";
import type { NotificationServiceLike } from "../../../src/services/notification-service.js";
import type { ObservabilityServiceLike } from "../../../src/services/observability-service.js";
import { prepareQueryRound } from "../../../src/runtime/query-preparation.js";
import { collectDynamicSystemMessages } from "../../../src/runtime/query-notifications.js";
import type { RuntimeCoordinationServiceLike } from "../../../src/services/runtime-coordination-service.js";

function createRuntimeState(): AgentRuntimeState {
  return {
    sessionId: "prepare-session",
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 2,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
  };
}

function createHookService(): HookServiceLike {
  return {
    run: vi.fn(async () => ({
      blocked: false,
      blockReason: null,
      messages: [],
      matched: 0,
      executed: 0,
      errors: [],
    })),
  };
}

function createObservabilityService(): ObservabilityServiceLike {
  return {
    createTraceId: vi.fn(() => "trace-test"),
    createSpanId: vi.fn(() => "span-test"),
    withExecutionContext: vi.fn(async (_context, fn: () => Promise<unknown>) => fn()),
    recordEvent: vi.fn(async () => ({
      schemaVersion: 1,
      id: "evt-test",
      at: 0,
      trace_id: "trace-test",
      span_id: null,
      kind: "test",
      payload: {},
    })),
  };
}

function createMemoryService(): MemoryServiceLike {
  return {
    autoExtract: vi.fn(async () => undefined),
    buildInjectionForQuery: vi.fn(async () => ({
      content: null,
      usedEntries: 0,
      estimatedTokens: 0,
    })),
    runAdd: vi.fn(async () => ""),
    runSearch: vi.fn(async () => ""),
    runList: vi.fn(async () => ""),
  };
}

function createNotificationService(): NotificationServiceLike {
  return {
    drainPendingQueryNotifications: vi.fn(async () => ({
      scheduled: [],
      subagent: [],
      background: [],
      team: [],
    })),
  };
}

function createRuntimeCoordinationService(): RuntimeCoordinationServiceLike {
  return {
    runAutonomyTick: vi.fn(async () => ({ ok: false, action: "noop" })),
    tickScheduler: vi.fn(async () => undefined),
    peekScheduledPromptCount: vi.fn(async () => 0),
  };
}

describe("runtime/query-preparation", () => {
  beforeEach(() => {
    vi.mocked(collectDynamicSystemMessages).mockResolvedValue([]);
  });

  it("returns a blocked result when session-start hooks reject the round", async () => {
    const hookService = createHookService();
    const memoryService = createMemoryService();
    const notificationService = createNotificationService();
    const observabilityService = createObservabilityService();
    const runtimeCoordinationService = createRuntimeCoordinationService();
    vi.mocked(hookService.run).mockResolvedValue({
      blocked: true,
      blockReason: "policy denied",
      messages: [],
      matched: 1,
      executed: 1,
      errors: [],
    });

    const result = await prepareQueryRound({
      runtimeState: createRuntimeState(),
      traceId: "trace_test",
      latestUserInput: "hello",
      hookService,
      memoryService,
      notificationService,
      observabilityService,
      runtimeCoordinationService,
    });

    expect(result).toEqual({
      ok: false,
      blockedReason: "policy denied",
    });
  });

  it("collects shared dynamic messages and memory context for the round", async () => {
    const runtimeState = createRuntimeState();
    const hookService = createHookService();
    const memoryService = createMemoryService();
    const notificationService = createNotificationService();
    const observabilityService = createObservabilityService();
    const runtimeCoordinationService = createRuntimeCoordinationService();
    runtimeState.roundsWithoutTodo = 3;
    vi.mocked(hookService.run).mockResolvedValue({
      blocked: false,
      blockReason: null,
      messages: ["seed"],
      matched: 1,
      executed: 1,
      errors: [],
    });
    vi.mocked(collectDynamicSystemMessages).mockResolvedValue(["seed"]);
    vi.mocked(memoryService.buildInjectionForQuery).mockResolvedValue({
      content: "memory block",
      usedEntries: 2,
      estimatedTokens: 40,
    });

    const result = await prepareQueryRound({
      runtimeState,
      traceId: "trace_test",
      latestUserInput: "hello",
      hookService,
      memoryService,
      notificationService,
      observabilityService,
      runtimeCoordinationService,
    });

    expect(result).toEqual({
      ok: true,
      memoryContext: "memory block",
      dynamicSystemMessages: [
        "seed",
        "<reminder>Please call the todo tool to update the task list and maintain progress.</reminder>",
      ],
    });
    expect(memoryService.autoExtract).toHaveBeenCalledWith("user", "hello");
    expect(runtimeState.lastMemoryInput).toBe("hello");
  });
});
