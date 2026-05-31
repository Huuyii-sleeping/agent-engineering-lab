import { describe, expect, it } from "vitest";
import { runHarnessAgentScenario } from "../../harness/agent.js";
import { createDeterministicOpenAIClient } from "../../harness/openai-client.js";

describe("agent harness deterministic OpenAI client", () => {
  it("returns scripted assistant-only responses", async () => {
    const client = createDeterministicOpenAIClient([
      { type: "message", content: "hello from harness" },
    ]);

    const response = await client.chat.completions.create({
      model: "harness-model",
      messages: [{ role: "user", content: "hello" }],
      tools: [],
    });

    expect(response.choices[0]?.finish_reason).toBe("stop");
    expect(response.choices[0]?.message).toMatchObject({
      role: "assistant",
      content: "hello from harness",
    });
    expect(client.requests).toEqual([
      expect.objectContaining({
        model: "harness-model",
        messageCount: 1,
        toolsCount: 0,
        messages: [{ role: "user", content: "hello" }],
      }),
    ]);
  });

  it("returns scripted tool calls records metadata and fails when exhausted", async () => {
    const client = createDeterministicOpenAIClient([
      {
        type: "tool_calls",
        content: "need a file",
        toolCalls: [{ id: "call_1", name: "read_file", argumentsJson: '{"path":"README.md"}' }],
      },
    ]);

    const response = await client.chat.completions.create({
      model: "harness-model",
      messages: [{ role: "user", content: "read it" }],
      tools: [
        {
          type: "function",
          function: {
            name: "read_file",
            description: "Read a file",
            parameters: { type: "object" },
          },
        },
      ],
      metadata: { scenario: "tool-flow" },
    });

    expect(response.choices[0]?.finish_reason).toBe("tool_calls");
    expect(response.choices[0]?.message.tool_calls).toEqual([
      {
        id: "call_1",
        type: "function",
        function: {
          name: "read_file",
          arguments: '{"path":"README.md"}',
        },
      },
    ]);
    expect(client.requests[0]).toMatchObject({
      model: "harness-model",
      messageCount: 1,
      toolsCount: 1,
      metadata: { scenario: "tool-flow" },
    });
    await expect(
      client.chat.completions.create({
        model: "harness-model",
        messages: [{ role: "user", content: "again" }],
        tools: [],
      }),
    ).rejects.toThrow("deterministic model script exhausted");
  });
});

describe("agent harness production query engine runner", () => {
  it("drives a real QueryEngine assistant-only round", async () => {
    const result = await runHarnessAgentScenario({
      name: "assistant-only",
      model: [{ type: "message", content: "done from real engine" }],
      messages: [{ role: "user", content: "finish it" }],
      assertions: [
        { name: "model request metric", expectMetric: { name: "modelRequests", equals: 1 } },
      ],
    });

    expect(result.status).toBe("passed");
    expect(result.stopReason).toBe("assistant_response");
    expect(result.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "done from real engine",
    });
    expect(result.modelRequests).toHaveLength(1);
    expect(result.observabilityEvents.map((event) => event.kind)).toContain("model_request");
  });

  it("preserves tool result order and exposes runtime state for a tool-driven round", async () => {
    const result = await runHarnessAgentScenario({
      name: "tool-driven",
      model: [
        {
          type: "tool_calls",
          toolCalls: [
            { id: "call_read_a", name: "read_file", argumentsJson: '{"path":"a.txt"}' },
            { id: "call_read_b", name: "read_file", argumentsJson: '{"path":"b.txt"}' },
          ],
        },
        { type: "message", content: "read both files" },
      ],
      workspace: {
        files: {
          "a.txt": "alpha",
          "b.txt": "beta",
        },
      },
      messages: [{ role: "user", content: "read files" }],
      toolFixtures: [
        {
          name: "read_file",
          readOnly: true,
          parallelSafe: true,
          handler: async ({ args, workspace }) => workspace.readText(String(args.path)),
        },
      ],
      assertions: [
        { name: "tool result order", expectToolResultOrder: ["call_read_a", "call_read_b"] },
        { name: "assistant final", expectAssistantContains: "read both files" },
      ],
    });

    expect(result.status).toBe("passed");
    expect(result.toolRecords.map((record) => record.toolCallId)).toEqual([
      "call_read_a",
      "call_read_b",
    ]);
    expect(result.runtimeState.roundCounter).toBe(2);
    expect(result.toolConcurrency.maxActive).toBeGreaterThan(1);
  });

  it("covers hook blocks model errors and scheduled notification injection", async () => {
    const blocked = await runHarnessAgentScenario({
      name: "hook-blocked",
      model: [{ type: "message", content: "unreached" }],
      messages: [{ role: "user", content: "hello" }],
      hookBlocks: { SessionStart: "policy says no" },
      assertions: [{ name: "blocked message", expectAssistantContains: "policy says no" }],
    });
    expect(blocked.status).toBe("passed");
    expect(blocked.stopReason).toBe("session_start_blocked");

    const failed = await runHarnessAgentScenario({
      name: "model-failed",
      model: [{ type: "error", message: "model boom" }],
      messages: [{ role: "user", content: "hello" }],
    });
    expect(failed.status).toBe("passed");
    expect(failed.stopReason).toBe("recovery_failed");
    expect(failed.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: expect.stringContaining("model boom"),
    });

    const scheduled = await runHarnessAgentScenario({
      name: "scheduled",
      model: [{ type: "message", content: "handled scheduled prompt" }],
      messages: [{ role: "user", content: "continue" }],
      includeScheduledNotifications: true,
      scheduledNotifications: [
        {
          id: "run_1",
          scheduleId: "schedule_1",
          prompt: "scheduled follow-up",
          recurring: false,
          firedAt: 1,
        },
      ],
      assertions: [{ name: "notification event", expectTraceEvent: "notification" }],
    });
    expect(scheduled.status).toBe("passed");
    expect(scheduled.modelRequests[0]?.messages.map((message) => message.role)).toContain("system");
    expect(JSON.stringify(scheduled.modelRequests[0]?.messages)).toContain("scheduled follow-up");
  });

  it("covers golden file side effects serial writes and readable observability assertion failures", async () => {
    const readWriteFlow = await runHarnessAgentScenario({
      name: "read-write-flow",
      model: [
        {
          type: "tool_calls",
          toolCalls: [
            { id: "call_read_source", name: "read_file", argumentsJson: '{"path":"source.txt"}' },
            {
              id: "call_write_copy",
              name: "write_file",
              argumentsJson: '{"path":"out/copy.txt","content":"copied"}',
            },
          ],
        },
        { type: "message", content: "copied file" },
      ],
      workspace: {
        files: {
          "source.txt": "source content",
        },
      },
      messages: [{ role: "user", content: "copy source" }],
      toolFixtures: [
        {
          name: "read_file",
          readOnly: true,
          parallelSafe: true,
          handler: async ({ args, workspace }) => workspace.readText(String(args.path)),
        },
        {
          name: "write_file",
          readOnly: false,
          parallelSafe: false,
          mutatesWorkspace: true,
          handler: async ({ args, workspace }) => {
            await workspace.writeText(String(args.path), String(args.content));
            return JSON.stringify({ ok: true, path: args.path });
          },
        },
      ],
      assertions: [
        {
          name: "read write order",
          expectToolResultOrder: ["call_read_source", "call_write_copy"],
        },
        { name: "copied file", expectFile: { path: "out/copy.txt", equals: "copied" } },
      ],
    });
    expect(readWriteFlow.status).toBe("passed");

    const writeFlow = await runHarnessAgentScenario({
      name: "write-flow",
      model: [
        {
          type: "tool_calls",
          toolCalls: [
            {
              id: "call_write_a",
              name: "write_file",
              argumentsJson: '{"path":"out/a.txt","content":"alpha"}',
            },
            {
              id: "call_write_b",
              name: "write_file",
              argumentsJson: '{"path":"out/b.txt","content":"beta"}',
            },
          ],
        },
        { type: "message", content: "wrote files" },
      ],
      messages: [{ role: "user", content: "write files" }],
      toolFixtures: [
        {
          name: "write_file",
          readOnly: false,
          parallelSafe: false,
          mutatesWorkspace: true,
          handler: async ({ args, workspace }) => {
            await workspace.writeText(String(args.path), String(args.content));
            return JSON.stringify({ ok: true, path: args.path });
          },
        },
      ],
      assertions: [
        { name: "write order", expectToolResultOrder: ["call_write_a", "call_write_b"] },
        { name: "file a", expectFile: { path: "out/a.txt", equals: "alpha" } },
        { name: "file b", expectFile: { path: "out/b.txt", equals: "beta" } },
      ],
    });
    expect(writeFlow.status).toBe("passed");
    expect(writeFlow.toolConcurrency.maxActive).toBe(1);

    const assertionFailure = await runHarnessAgentScenario({
      name: "missing-event",
      model: [{ type: "message", content: "done" }],
      messages: [{ role: "user", content: "hello" }],
      assertions: [{ name: "must record custom event", expectTraceEvent: "custom_missing_event" }],
    });

    expect(assertionFailure.status).toBe("failed");
    expect(assertionFailure.failedStep).toBe("must record custom event");
    expect(assertionFailure.steps.find((step) => step.status === "failed")?.message).toContain(
      "custom_missing_event",
    );
  });
});
