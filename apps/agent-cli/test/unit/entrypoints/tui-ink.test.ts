import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { describe, expect, it, vi } from "vitest";
import { createInkRuntimeController } from "../../../src/entrypoints/tui-ink.js";
import type { AgentAppRuntimeDeps } from "../../../src/bootstrap/app-runtime.js";
import type { TerminalTuiServiceLike } from "../../../src/entrypoints/tui.js";

const PROMPT_SOURCE = {
  core: "test-core",
  tools: [],
  skills: [],
  rules: [],
};

function createService(
  history: ChatCompletionMessageParam[],
  assistant = "chat reply",
): TerminalTuiServiceLike {
  const sessions = [
    {
      id: "s01",
      busy: false,
      history,
    },
  ];

  return {
    bridgeManifest: () => ({ endpoints: { events: "/events" } }),
    createSession: vi.fn(() => sessions[0]),
    listSessions: vi.fn(() => sessions),
    toolsMetadata: vi.fn(async () => []),
    chat: vi.fn(async (input) => {
      history.push({ role: "user", content: String(input.message) });
      history.push({ role: "assistant", content: assistant });
      return { ok: true, session: { id: "s01" }, assistant };
    }),
  };
}

describe("entrypoints/tui-ink", () => {
  it("runs due scheduled prompts through the Ink runtime controller", async () => {
    const history: ChatCompletionMessageParam[] = [];
    const service = createService(history, "喝水提醒到了");
    const app = {
      client: {} as OpenAI,
      model: "test-model",
      promptSource: PROMPT_SOURCE,
      runtimeCoordinationService: {
        runAutonomyTick: vi.fn(async () => ({})),
        tickScheduler: vi.fn(async () => undefined),
        peekScheduledPromptCount: vi.fn(async () => 1),
      },
    } as unknown as AgentAppRuntimeDeps;

    const controller = createInkRuntimeController({ service, app, startupIssue: null });
    const messages = await controller.runScheduledTick();

    expect(app.runtimeCoordinationService.tickScheduler).toHaveBeenCalledTimes(1);
    expect(service.chat).toHaveBeenCalledWith({
      session_id: "s01",
      message: "Handle any scheduled prompts that are due now.",
      include_scheduled_notifications: true,
    });
    expect(history).toEqual([
      { role: "user", content: "Handle any scheduled prompts that are due now." },
      { role: "assistant", content: "喝水提醒到了" },
    ]);
    expect(messages.map((message) => message.text).join("\n")).toContain("scheduled due");
    expect(messages.map((message) => message.text).join("\n")).toContain("喝水提醒到了");
  });

  it("drives due scheduled prompts through daemon-backed services", async () => {
    const history: ChatCompletionMessageParam[] = [];
    const service = createService(history);
    const coordination = {
      runAutonomyTick: vi.fn(async () => ({})),
      tickScheduler: vi.fn(async () => undefined),
      peekScheduledPromptCount: vi.fn(async () => 1),
    };
    service.chat = vi.fn(async (input) => {
      history.push({ role: "user", content: String(input.message) });
      history.push({ role: "assistant", content: "daemon 喝水提醒到了" });
      return {
        ok: true,
        session: { id: input.session_id ?? "s01" },
        assistant: "daemon 喝水提醒到了",
      };
    });

    const controller = createInkRuntimeController({
      service,
      app: null,
      startupIssue: null,
      runtimeCoordinationService: coordination,
    });
    const messages = await controller.runScheduledTick();

    expect(coordination.tickScheduler).toHaveBeenCalledTimes(1);
    expect(service.chat).toHaveBeenCalledWith({
      session_id: "s01",
      message: "Handle any scheduled prompts that are due now.",
      include_scheduled_notifications: true,
    });
    expect(messages.map((message) => message.text).join("\n")).toContain("scheduled due");
    expect(messages.map((message) => message.text).join("\n")).toContain("daemon 喝水提醒到了");
  });
});
