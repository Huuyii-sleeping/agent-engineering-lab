import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type OpenAI from "openai";
import { createAgentAppRuntime, type AgentAppRuntimeDeps } from "../bootstrap/app-runtime.js";
import { AgentHost } from "../host/agent-host.js";
import { createMastraAgentService } from "../runtime/mastra-default-service.js";
import { getStaticPromptSource } from "../config.js";
import {
  resolveDaemonCliService,
  type DaemonCliServiceResolution,
  type InteractiveCliServiceLike,
} from "./service-adapter.js";
import { completeCliLine } from "./completion.js";
import {
  listCliHelpTopics,
  renderCliBanner,
  renderCliCloseout,
  renderCliError,
  renderCliEvent,
  renderCliPrompt,
  renderCliSection,
  renderCliSessions,
  renderCliTools,
} from "./ui.js";
import type { RuntimeCoordinationServiceLike } from "../services/index.js";

type LineEditor = {
  line: string;
  write(input: string): void;
};

type ChunkWriter = {
  write(chunk: string): void;
};

type ScheduledRoundOptions = {
  service: Pick<InteractiveCliServiceLike, "chat">;
  sessionId: string;
  isAgentBusy: () => boolean;
  setAgentBusy: (busy: boolean) => void;
  printAsyncEvent: (label: string, content: string) => void;
  runtimeCoordinationService: RuntimeCoordinationServiceLike;
};

type RunCliOverrides = Partial<AgentAppRuntimeDeps>;

export type RunCliOptions = RunCliOverrides & {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  service?: InteractiveCliServiceLike;
  resolveDaemonService?: () => Promise<DaemonCliServiceResolution | null>;
};

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isReadlineClosedError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ERR_USE_AFTER_CLOSE");
}

export function renderAsyncCliEvent(opts: {
  output: ChunkWriter;
  prompt: string;
  label: string;
  content: string;
  waitingForInput: boolean;
  lineEditor?: LineEditor;
}): void {
  const body = renderCliEvent({
    kind: "scheduled",
    status: opts.label.includes("error") ? "failed" : opts.label.includes("due") ? "due" : "done",
    title: opts.label,
    detail: opts.content.trim() || undefined,
  });
  if (!opts.waitingForInput) {
    opts.output.write(`\n${body}\n`);
    return;
  }
  const bufferedInput = opts.lineEditor?.line ?? "";
  opts.output.write("\r\u001b[2K");
  opts.output.write(`\n${body}\n`);
  opts.output.write(opts.prompt);
  if (bufferedInput && opts.lineEditor) opts.lineEditor.write(bufferedInput);
}

/** 定时触发只调用 AgentService，不再存在独立 Agent loop。 */
export async function runScheduledRound(opts: ScheduledRoundOptions): Promise<boolean> {
  try {
    if (opts.isAgentBusy()) return false;
    await opts.runtimeCoordinationService.tickScheduler();
    const dueCount = await opts.runtimeCoordinationService.peekScheduledPromptCount();
    if (dueCount === 0) return false;
    opts.setAgentBusy(true);
    opts.printAsyncEvent(
      "scheduled due",
      `${dueCount} scheduled prompt${dueCount === 1 ? "" : "s"} due now.`,
    );
    try {
      const result = await opts.service.chat({
        session_id: opts.sessionId,
        message: "Handle any scheduled prompts that are due now.",
        include_scheduled_notifications: true,
      });
      if (result.ok === false) {
        const error = result.error as { message?: unknown } | undefined;
        throw new Error(String(error?.message ?? "scheduled Agent run failed"));
      }
      const assistant = String(result.assistant ?? "").trim();
      opts.printAsyncEvent(
        "scheduled",
        assistant || "Scheduled prompt processed without a text reply. Check tool output and side effects above.",
      );
      return true;
    } catch (error) {
      opts.printAsyncEvent("scheduled error", formatError(error));
      return false;
    } finally {
      opts.setAgentBusy(false);
    }
  } catch (error) {
    opts.printAsyncEvent("scheduled error", formatError(error));
    return false;
  }
}

function sessionSummaries(service: InteractiveCliServiceLike, activeSessionId: string | null) {
  return service.listSessions().map((session) => ({
    id: session.id,
    messageCount: session.messageCount ?? session.history.length,
    busy: session.busy,
    active: session.id === activeSessionId,
  }));
}

async function runServiceCli(opts: {
  service: InteractiveCliServiceLike;
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  notice: string | null;
}): Promise<void> {
  let activeSessionId = opts.service.listSessions().at(-1)?.id ?? null;
  const model = opts.notice?.startsWith("Connected to daemon") ? "daemon-host" : process.env.MODEL_ID?.trim() || "unset-model";
  const renderBanner = () => renderCliBanner({
    title: "Agent CLI",
    workspace: path.basename(process.cwd()),
    mode: "interactive/agent",
    model,
    sessionId: activeSessionId,
    commands: ["/help", "/sessions", "/new", "/tools", "/exit"],
  });
  const rl = createInterface({
    input: opts.input,
    output: opts.output,
    completer: (line) => completeCliLine(line, {
      sessions: sessionSummaries(opts.service, activeSessionId),
      helpTopics: listCliHelpTopics(),
      transcriptEntryCount: activeSessionId
        ? opts.service.listSessions().find((session) => session.id === activeSessionId)?.history.length ?? 0
        : 0,
      paletteEntryCount: 0,
      model,
    }),
  });
  opts.output.write(`${renderBanner()}\n`);
  if (opts.notice) opts.output.write(`${opts.notice}\n\n`);
  try {
    while (true) {
      let query: string;
      try {
        query = await rl.question(renderCliPrompt(activeSessionId, { active: false, lineCount: 0, charCount: 0 }, "agent"));
      } catch (error) {
        if (isReadlineClosedError(error)) break;
        throw error;
      }
      const normalized = query.trim();
      if (!normalized) continue;
      if (normalized === "exit" || normalized === "q" || normalized === "/exit" || normalized === "/quit") {
        opts.output.write(`${renderCliCloseout({ sessionId: activeSessionId, changedPaths: [] })}\n`);
        break;
      }
      if (normalized === "/help") {
        opts.output.write("Commands: /sessions /new /use <id> /tools /exit\n\n");
        continue;
      }
      if (normalized === "/sessions") {
        opts.output.write(`${renderCliSessions(sessionSummaries(opts.service, activeSessionId))}\n\n`);
        continue;
      }
      if (normalized === "/new") {
        activeSessionId = (await opts.service.createSession()).id;
        opts.output.write(`${renderCliSection("Session", activeSessionId)}\n\n`);
        continue;
      }
      if (normalized.startsWith("/use ")) {
        const requested = normalized.slice(5).trim();
        if (opts.service.listSessions().some((session) => session.id === requested)) {
          activeSessionId = requested;
          opts.output.write(`${renderCliSection("Session", activeSessionId)}\n\n`);
        } else {
          opts.output.write(`${renderCliError("session not found", requested)}\n\n`);
        }
        continue;
      }
      if (normalized === "/tools") {
        opts.output.write(`${renderCliTools(await opts.service.toolsMetadata())}\n\n`);
        continue;
      }
      if (!activeSessionId) activeSessionId = (await opts.service.createSession()).id;
      const result = await opts.service.chat({ session_id: activeSessionId, message: query });
      if (result.ok === false) {
        const error = result.error as { message?: unknown } | undefined;
        opts.output.write(`${renderCliError("chat failed", String(error?.message ?? "chat failed"))}\n\n`);
        continue;
      }
      const session = result.session as { id?: unknown } | undefined;
      if (typeof session?.id === "string") activeSessionId = session.id;
      const assistant = String(result.assistant ?? "").trim();
      if (assistant) opts.output.write(`${renderCliSection("Assistant", assistant)}\n\n`);
    }
  } finally {
    rl.close();
  }
}

export async function runCli(options: RunCliOptions = {}): Promise<void> {
  const { input = stdin, output = stdout, service, resolveDaemonService, ...runtimeOverrides } = options;
  let selected = service ?? null;
  let notice: string | null = null;
  if (!selected) {
    try {
      const resolved = await (resolveDaemonService ?? (() => resolveDaemonCliService()))();
      selected = resolved?.service ?? null;
      notice = resolved?.notice ?? null;
    } catch (error) {
      notice = renderCliError(
        "daemon attach failed",
        formatError(error),
        "falling back to embedded runtime",
      );
    }
  }
  if (!selected) {
    let app: AgentAppRuntimeDeps;
    try {
      app = createAgentAppRuntime(runtimeOverrides);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("Missing environment variable: MODEL_ID")) throw error;
      app = createAgentAppRuntime({
        ...runtimeOverrides,
        client: runtimeOverrides.client ?? ({} as OpenAI),
        model: runtimeOverrides.model ?? "unset-model",
        promptSource: runtimeOverrides.promptSource ?? getStaticPromptSource(),
      });
    }
    const host = new AgentHost(app);
    await host.initialize();
    selected = await createMastraAgentService(app, host);
  }
  await runServiceCli({ service: selected, input, output, notice });
}
