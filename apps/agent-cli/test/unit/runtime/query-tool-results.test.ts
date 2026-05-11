import { describe, expect, it } from "vitest";
import {
  analyzeToolOutput,
  isTodoCompletionRequest,
  markWriteSideEffect,
  parseTaskIdFromToolOutput,
} from "../../../src/runtime/query-tool-results.js";
import type { AgentRuntimeState } from "../../../src/agent-loop.js";

function createRuntimeState(): AgentRuntimeState {
  return {
    sessionId: "test-session",
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 0,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
  };
}

describe("runtime/query-tool-results", () => {
  it("classifies structured tool failures for telemetry", () => {
    expect(analyzeToolOutput('{"ok":false,"error":{"code":"SECURITY_APPROVAL_REQUIRED"}}')).toEqual({
      ok: false,
      errorCode: "SECURITY_APPROVAL_REQUIRED",
      summary: '{"ok":false,"error":{"code":"SECURITY_APPROVAL_REQUIRED"}}',
    });
  });

  it("extracts created task ids from successful tool output", () => {
    expect(parseTaskIdFromToolOutput('{"ok":true,"id":12}')).toBe(12);
    expect(parseTaskIdFromToolOutput('{"ok":false,"error":{"code":"TASK_FAILED"}}')).toBeNull();
  });

  it("tracks workspace write side effects for delivery follow-up", () => {
    const runtimeState = createRuntimeState();

    markWriteSideEffect(runtimeState, "write_file", { path: "tmp/demo.txt" });

    expect(runtimeState.wroteWorkspaceFiles).toBe(true);
    expect([...runtimeState.touchedPaths]).toEqual(["tmp/demo.txt"]);
  });

  it("recognizes todo completion batches", () => {
    expect(
      isTodoCompletionRequest({
        items: [
          { status: "completed" },
          { status: "completed" },
        ],
      }),
    ).toBe(true);
    expect(isTodoCompletionRequest({ items: [{ status: "in_progress" }] })).toBe(false);
  });
});
