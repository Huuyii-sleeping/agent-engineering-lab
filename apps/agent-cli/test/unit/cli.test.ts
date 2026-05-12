import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { describe, expect, it, vi } from "vitest";
import { renderAsyncCliEvent, runScheduledRound } from "../../src/cli.js";
import type { AgentRuntimeState } from "../../src/agent-loop.js";
import type { StaticPromptSource } from "../../src/prompt/types.js";

const PROMPT_SOURCE: StaticPromptSource = {
  core: "test-core",
  tools: [],
  skills: [],
  rules: [],
};

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

describe("renderAsyncCliEvent", () => {
  it("redraws the prompt when an async event arrives during idle input", () => {
    const writes: string[] = [];
    const lineEditor = {
      line: "partial input",
      write: vi.fn((input: string) => {
        writes.push(`restore:${input}`);
      }),
    };

    renderAsyncCliEvent({
      output: {
        write(chunk: string) {
          writes.push(chunk);
        },
      },
      prompt: "s01 >> ",
      label: "scheduled",
      content: "follow up now",
      waitingForInput: true,
      lineEditor,
    });

    expect(writes).toEqual([
      "\r\u001b[2K",
      "\n\u001b[36m[scheduled]\u001b[0m follow up now\n",
      "s01 >> ",
      "restore:partial input",
    ]);
  });
});

describe("runScheduledRound", () => {
  it("runs a scheduled round and emits visible notices when prompts are due", async () => {
    const notices: string[] = [];
    const history: ChatCompletionMessageParam[] = [];
    let busy = false;

    const triggered = await runScheduledRound({
      isAgentBusy: () => busy,
      setAgentBusy: (next) => {
        busy = next;
      },
      history,
      runtimeState: createRuntimeState(),
      client: {} as OpenAI,
      model: "test-model",
      promptSource: PROMPT_SOURCE,
      printAsyncEvent: (label, content) => {
        notices.push(`${label}:${content}`);
      },
      runtimeCoordinationService: {
        runAutonomyTick: async () => ({}),
        tickScheduler: async () => {},
        peekScheduledPromptCount: async () => 1,
      },
      queryEngine: {
        run: async ({ messages }) => {
          messages.push({ role: "assistant", content: "scheduled reply" });
        },
      },
    });

    expect(triggered).toBe(true);
    expect(busy).toBe(false);
    expect(history).toEqual([
      { role: "user", content: "Handle any scheduled prompts that are due now." },
      { role: "assistant", content: "scheduled reply" },
    ]);
    expect(notices).toEqual([
      "scheduled due:1 scheduled prompt due now.",
      "scheduled:scheduled reply",
    ]);
  });

  it("prints a fallback notice when the scheduled round finishes without assistant text", async () => {
    const notices: string[] = [];

    await runScheduledRound({
      isAgentBusy: () => false,
      setAgentBusy: () => {},
      history: [{ role: "tool", content: "{}" }],
      runtimeState: createRuntimeState(),
      client: {} as OpenAI,
      model: "test-model",
      promptSource: PROMPT_SOURCE,
      printAsyncEvent: (label, content) => {
        notices.push(`${label}:${content}`);
      },
      runtimeCoordinationService: {
        runAutonomyTick: async () => ({}),
        tickScheduler: async () => {},
        peekScheduledPromptCount: async () => 1,
      },
      queryEngine: {
        run: async () => {},
      },
    });

    expect(notices[1]).toContain("Scheduled prompt processed without a text reply.");
  });

  it("surfaces scheduled round errors instead of swallowing them silently", async () => {
    const notices: string[] = [];
    let busy = false;

    const triggered = await runScheduledRound({
      isAgentBusy: () => busy,
      setAgentBusy: (next) => {
        busy = next;
      },
      history: [],
      runtimeState: createRuntimeState(),
      client: {} as OpenAI,
      model: "test-model",
      promptSource: PROMPT_SOURCE,
      printAsyncEvent: (label, content) => {
        notices.push(`${label}:${content}`);
      },
      runtimeCoordinationService: {
        runAutonomyTick: async () => ({}),
        tickScheduler: async () => {},
        peekScheduledPromptCount: async () => 1,
      },
      queryEngine: {
        run: async () => {
          throw new Error("scheduler loop failed");
        },
      },
    });

    expect(triggered).toBe(false);
    expect(busy).toBe(false);
    expect(notices).toEqual([
      "scheduled due:1 scheduled prompt due now.",
      "scheduled error:scheduler loop failed",
    ]);
  });
});
