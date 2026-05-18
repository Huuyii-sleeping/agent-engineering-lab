import OpenAI from "openai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTimeout as sleep } from "node:timers/promises";
import type { AgentRuntimeState } from "../../../src/agent-loop.js";
import type { HookServiceLike } from "../../../src/services/hook-service.js";
import type { ObservabilityServiceLike } from "../../../src/services/observability-service.js";
import { runQueryToolStage } from "../../../src/runtime/query-tools.js";
import type { ToolRegistration } from "../../../src/tools/protocol.js";
import type { ToolServiceLike } from "../../../src/tools/service.js";

function createRuntimeState(): AgentRuntimeState {
  return {
    sessionId: "query-tools-session",
    roundsWithoutTodo: 0,
    activeTaskId: null,
    lastMemoryInput: null,
    roundCounter: 1,
    touchedPaths: new Set<string>(),
    wroteWorkspaceFiles: false,
  };
}

function createToolService(): ToolServiceLike {
  return {
    listTools: async () => [],
    listToolRegistrations: async () => [],
    listToolMetadata: async () => [],
    getToolRegistration: vi.fn(async () => null),
    previewToolCall: vi.fn((name: string) => `preview:${name}`),
    runToolByName: vi.fn(),
  };
}

function registration(name: string, execution: ToolRegistration["execution"]): ToolRegistration {
  return {
    name,
    description: name,
    parameters: { type: "object", properties: {} },
    target: "base",
    allowDuringReplay: execution.readOnly,
    execution,
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
      span_id: "span-test",
      kind: "tool_call",
      payload: {},
    })),
  };
}

function createMessage(toolCalls: Array<{ id: string; name: string; argumentsJson: string }>): OpenAI.Chat.Completions.ChatCompletionMessage {
  return {
    role: "assistant",
    content: "",
    tool_calls: toolCalls.map((toolCall) => ({
      id: toolCall.id,
      type: "function",
      function: {
        name: toolCall.name,
        arguments: toolCall.argumentsJson,
      },
    })),
  } as OpenAI.Chat.Completions.ChatCompletionMessage;
}

describe("runtime/query-tools", () => {
  const tempRoots: string[] = [];
  const previousSkillRoots = process.env.AGENT_SKILL_ROOTS;
  const previousSkills = process.env.AGENT_SKILLS;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    if (previousSkillRoots === undefined) {
      delete process.env.AGENT_SKILL_ROOTS;
    } else {
      process.env.AGENT_SKILL_ROOTS = previousSkillRoots;
    }
    if (previousSkills === undefined) {
      delete process.env.AGENT_SKILLS;
    } else {
      process.env.AGENT_SKILLS = previousSkills;
    }
  });

  function createSkillRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-cli-query-skills-"));
    tempRoots.push(root);
    return root;
  }

  function writeSkill(root: string, name: string, body: string): void {
    const skillDir = path.join(root, name);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), body);
  }

  it("records successful write side effects and appends post-tool hook messages", async () => {
    const runtimeState = createRuntimeState();
    const messages = [] as Array<{ role: string; content?: string; tool_call_id?: string }>;
    const toolService = createToolService();
    const hookService = createHookService();
    const observabilityService = createObservabilityService();
    vi.mocked(toolService.runToolByName).mockResolvedValueOnce(JSON.stringify({ ok: true }));
    vi.mocked(hookService.run)
      .mockResolvedValueOnce({
        blocked: false,
        blockReason: null,
        messages: [],
        matched: 1,
        executed: 1,
        errors: [],
      })
      .mockResolvedValueOnce({
        blocked: false,
        blockReason: null,
        messages: ["write reviewed by hook"],
        matched: 1,
        executed: 1,
        errors: [],
      });

    const result = await runQueryToolStage({
      message: createMessage([
        {
          id: "call_write",
          name: "write_file",
          argumentsJson: JSON.stringify({ path: "tmp/demo.txt", content: "hello" }),
        },
      ]),
      messages,
      runtimeState,
      traceId: "trace-write",
      toolService,
      hookService,
      observabilityService,
    });

    expect(result.usedTodo).toBe(false);
    expect(runtimeState.wroteWorkspaceFiles).toBe(true);
    expect([...runtimeState.touchedPaths]).toEqual(["tmp/demo.txt"]);
    expect(messages).toEqual([
      {
        role: "tool",
        tool_call_id: "call_write",
        content: JSON.stringify({ ok: true }),
      },
      {
        role: "system",
        content: "write reviewed by hook",
      },
    ]);
  });

  it("returns hook-blocked tool output without executing the underlying tool", async () => {
    const runtimeState = createRuntimeState();
    const messages = [] as Array<{ role: string; content?: string; tool_call_id?: string }>;
    const toolService = createToolService();
    const hookService = createHookService();
    const observabilityService = createObservabilityService();
    vi.mocked(hookService.run).mockResolvedValueOnce({
      blocked: true,
      blockReason: "blocked by test",
      messages: ["pre block notice"],
      matched: 1,
      executed: 1,
      errors: [],
    });

    const result = await runQueryToolStage({
      message: createMessage([
        {
          id: "call_blocked",
          name: "write_file",
          argumentsJson: JSON.stringify({ path: "tmp/blocked.txt", content: "nope" }),
        },
      ]),
      messages,
      runtimeState,
      traceId: "trace-blocked",
      toolService,
      hookService,
      observabilityService,
    });

    expect(result.usedTodo).toBe(false);
    expect(toolService.runToolByName).not.toHaveBeenCalled();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({
      role: "system",
      content: "pre block notice",
    });
    expect(messages[1]?.role).toBe("tool");
    expect(String(messages[1]?.content)).toContain("HOOK_BLOCKED");
  });

  it("activates matching path-scoped skills after successful file tool use", async () => {
    const root = createSkillRoot();
    writeSkill(
      root,
      "apps-workflow",
      ["---", "description: Apps workflow.", "paths: apps/**", "---", "Hidden workflow body."].join("\n"),
    );
    process.env.AGENT_SKILL_ROOTS = root;
    process.env.AGENT_SKILLS = "all";
    const runtimeState = createRuntimeState();
    const messages = [] as Array<{ role: string; content?: string; tool_call_id?: string }>;
    const toolService = createToolService();
    const hookService = createHookService();
    const observabilityService = createObservabilityService();
    vi.mocked(toolService.runToolByName).mockResolvedValueOnce(JSON.stringify({ ok: true, content: "read" }));

    await runQueryToolStage({
      message: createMessage([
        { id: "call_read", name: "read_file", argumentsJson: JSON.stringify({ path: "apps/agent-cli/src/config.ts" }) },
      ]),
      messages,
      runtimeState,
      traceId: "trace-conditional-skill",
      toolService,
      hookService,
      observabilityService,
    });

    const activation = messages.find((message) => message.role === "system" && message.content?.includes("apps-workflow"));
    expect(activation?.content).toContain("Call load_skill");
    expect(activation?.content).not.toContain("Hidden workflow body.");
  });

  it("auto-completes the active task when todo marks every item completed", async () => {
    const runtimeState = createRuntimeState();
    const messages = [] as Array<{ role: string; content?: string; tool_call_id?: string }>;
    const toolService = createToolService();
    const hookService = createHookService();
    const observabilityService = createObservabilityService();
    vi.mocked(toolService.runToolByName)
      .mockResolvedValueOnce(JSON.stringify({ ok: true, id: 42 }))
      .mockResolvedValueOnce(JSON.stringify({ ok: true }))
      .mockResolvedValueOnce(JSON.stringify({ ok: true }));

    const result = await runQueryToolStage({
      message: createMessage([
        {
          id: "call_create",
          name: "task_create",
          argumentsJson: JSON.stringify({ title: "demo task" }),
        },
        {
          id: "call_todo",
          name: "todo",
          argumentsJson: JSON.stringify({
            items: [
              { text: "a", status: "completed" },
              { text: "b", status: "completed" },
            ],
          }),
        },
      ]),
      messages,
      runtimeState,
      traceId: "trace-todo",
      toolService,
      hookService,
      observabilityService,
    });

    expect(result.usedTodo).toBe(true);
    expect(toolService.runToolByName).toHaveBeenNthCalledWith(1, "task_create", JSON.stringify({ title: "demo task" }));
    expect(toolService.runToolByName).toHaveBeenNthCalledWith(
      2,
      "todo",
      JSON.stringify({
        items: [
          { text: "a", status: "completed" },
          { text: "b", status: "completed" },
        ],
      }),
    );
    expect(toolService.runToolByName).toHaveBeenNthCalledWith(
      3,
      "task_update",
      JSON.stringify({
        task_id: 42,
        status: "completed",
      }),
    );
    expect(runtimeState.activeTaskId).toBeNull();
  });

  it("runs read-only parallel-safe tool calls concurrently while appending results in original order", async () => {
    const runtimeState = createRuntimeState();
    const messages = [] as Array<{ role: string; content?: string; tool_call_id?: string }>;
    const toolService = createToolService();
    const hookService = createHookService();
    const observabilityService = createObservabilityService();
    let active = 0;
    let maxActive = 0;
    vi.mocked(toolService.getToolRegistration).mockImplementation(async (name: string) =>
      registration(name, {
        readOnly: true,
        mutatesWorkspace: false,
        parallelSafe: true,
        riskLevel: "low",
      }),
    );
    vi.mocked(toolService.runToolByName).mockImplementation(async (name: string) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleep(name === "read_file" ? 30 : 5);
      active -= 1;
      return JSON.stringify({ ok: true, name });
    });

    await runQueryToolStage({
      message: createMessage([
        { id: "call_read", name: "read_file", argumentsJson: JSON.stringify({ path: "README.md" }) },
        { id: "call_list", name: "task_list", argumentsJson: "{}" },
      ]),
      messages,
      runtimeState,
      traceId: "trace-parallel",
      toolService,
      hookService,
      observabilityService,
    });

    expect(maxActive).toBe(2);
    expect(messages.map((message) => message.tool_call_id)).toEqual(["call_read", "call_list"]);
    expect(String(messages[0]?.content)).toContain('"name":"read_file"');
    expect(String(messages[1]?.content)).toContain('"name":"task_list"');
  });

  it("keeps write-capable tool calls serial even when adjacent", async () => {
    const runtimeState = createRuntimeState();
    const messages = [] as Array<{ role: string; content?: string; tool_call_id?: string }>;
    const toolService = createToolService();
    const hookService = createHookService();
    const observabilityService = createObservabilityService();
    let active = 0;
    let maxActive = 0;
    vi.mocked(toolService.getToolRegistration).mockImplementation(async (name: string) =>
      registration(name, {
        readOnly: false,
        mutatesWorkspace: true,
        parallelSafe: false,
        riskLevel: "medium",
      }),
    );
    vi.mocked(toolService.runToolByName).mockImplementation(async (name: string) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleep(5);
      active -= 1;
      return JSON.stringify({ ok: true, name });
    });

    await runQueryToolStage({
      message: createMessage([
        { id: "call_write_a", name: "write_file", argumentsJson: JSON.stringify({ path: "a", content: "a" }) },
        { id: "call_write_b", name: "edit_file", argumentsJson: JSON.stringify({ path: "b", old_text: "b", new_text: "c" }) },
      ]),
      messages,
      runtimeState,
      traceId: "trace-serial",
      toolService,
      hookService,
      observabilityService,
    });

    expect(maxActive).toBe(1);
    expect(messages.map((message) => message.tool_call_id)).toEqual(["call_write_a", "call_write_b"]);
  });
});
