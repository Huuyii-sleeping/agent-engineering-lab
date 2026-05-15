import { Readable, Writable } from "node:stream";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { describe, expect, it, vi } from "vitest";
import { renderAsyncCliEvent, runCli, runScheduledRound } from "../../src/cli/index.js";
import type { InteractiveCliServiceLike } from "../../src/cli/service-adapter.js";
import { resetCliUiForTest, setCliUiColorEnabled } from "../../src/cli/ui.js";
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

function createOutputCapture(chunks: string[]): Writable {
  return new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
}

function createDaemonCliService(initialSessions: Array<{ id: string; history: ChatCompletionMessageParam[] }> = []): InteractiveCliServiceLike {
  const sessions = initialSessions.map((session) => ({
    id: session.id,
    busy: false,
    history: [...session.history],
    messageCount: session.history.length,
  }));

  return {
    bridgeManifest: () => ({ endpoints: { events: "http://127.0.0.1:4317/events" } }),
    createSession: vi.fn(async () => {
      const session = {
        id: `s${String(sessions.length + 1).padStart(2, "0")}`,
        busy: false,
        history: [] as ChatCompletionMessageParam[],
        messageCount: 0,
      };
      sessions.push(session);
      return { id: session.id };
    }),
    listSessions: vi.fn(() => sessions.map((session) => ({ ...session, history: [...session.history] }))),
    toolsMetadata: vi.fn(async () => [{ name: "shell", target: "base", description: "Run shell" }]),
    chat: vi.fn(async (input) => {
      let session = sessions.find((item) => item.id === input.session_id);
      if (!session) {
        session = {
          id: input.session_id ?? `s${String(sessions.length + 1).padStart(2, "0")}`,
          busy: false,
          history: [],
          messageCount: 0,
        };
        sessions.push(session);
      }
      if (input.message) {
        session.history.push({ role: "user", content: input.message });
        session.history.push({ role: "assistant", content: `reply:${input.message}` });
        session.messageCount = session.history.length;
      }
      return {
        ok: true,
        session: { id: session.id },
        assistant: `reply:${input.message ?? ""}`,
      };
    }),
    runToolByName: vi.fn(async () => "ok"),
  };
}

describe("renderAsyncCliEvent", () => {
  it("can render without terminal colors for deterministic logs", () => {
    setCliUiColorEnabled(false);
    const writes: string[] = [];

    renderAsyncCliEvent({
      output: { write: (chunk: string) => writes.push(chunk) },
      prompt: "agent:test >> ",
      label: "scheduled due",
      content: "one prompt due",
      waitingForInput: false,
    });

    expect(writes[0]).toContain("due scheduled scheduled due");
    resetCliUiForTest();
  });

  it("redraws the prompt when an async event arrives during idle input", () => {
    setCliUiColorEnabled(true);
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
      "\n\u001b[32mdone\u001b[0m scheduled \u001b[36mscheduled\u001b[0m\n\u001b[90mdetail\u001b[0m  follow up now\n",
      "s01 >> ",
      "restore:partial input",
    ]);
    resetCliUiForTest();
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

describe("runCli", () => {
  it("prefers a resolved daemon-backed interactive CLI service", async () => {
    const chunks: string[] = [];
    const service = createDaemonCliService();

    await runCli({
      input: Readable.from(["hello daemon\n", "exit\n"]),
      output: createOutputCapture(chunks),
      resolveDaemonService: async () => ({
        service,
        notice: "Connected to daemon (pid=4242 0 shared sessions)",
      }),
    });

    expect(chunks.join("")).toContain("Connected to daemon");
    expect(chunks.join("")).toContain("reply:hello daemon");
    expect(service.createSession).toHaveBeenCalledTimes(1);
    expect(service.chat).toHaveBeenCalledWith({
      session_id: "s01",
      message: "hello daemon",
    });
  });

  it("falls back to the embedded interactive CLI when daemon attach fails", async () => {
    const chunks: string[] = [];

    await runCli({
      input: Readable.from(["/sessions\n", "exit\n"]),
      output: createOutputCapture(chunks),
      resolveDaemonService: async () => {
        throw new Error("boom");
      },
      client: {} as OpenAI,
      model: "test-model",
      promptSource: PROMPT_SOURCE,
    });

    expect(chunks.join("")).toContain("daemon attach failed");
    expect(chunks.join("")).toContain("falling back to embedded runtime");
    expect(chunks.join("")).toContain("Sessions");
  });
});
