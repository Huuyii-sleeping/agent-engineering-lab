import type { ReadStream, WriteStream } from "node:tty";
import { render } from "ink";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
  createAgentAppRuntime,
  type AgentAppRuntimeDeps,
} from "../bootstrap/app-runtime.js";
import type { AgentRuntimeState } from "../agent-loop.js";
import { runScheduledRound } from "../cli/index.js";
import { CliComposerStore } from "../cli/composer.js";
import { CliPaletteStore } from "../cli/palette.js";
import { CliTranscriptBrowserStore } from "../cli/transcript.js";
import type { CliWorkflowMode } from "../cli/workflow.js";
import { getStaticPromptSource } from "../config.js";
import { RUNTIME_CONFIG } from "../runtime-config.js";
import { AgentService } from "../service-api/index.js";
import {
  DEFAULT_RUNTIME_COORDINATION_SERVICE,
  type RuntimeCoordinationServiceLike,
} from "../services/runtime-coordination-service.js";
import {
  handleTerminalTuiCommand,
  resolveDaemonTuiService,
  type DaemonTuiServiceResolution,
  type TerminalTuiServiceLike,
} from "./tui.js";
import {
  InkTuiPreviewApp,
  buildInkTuiPreviewSnapshot,
  createPreviewResponse,
  type InkTuiPreviewMessage,
} from "../terminal-ui/ink-tui.js";

export type InkTerminalTuiIo = {
  input: NodeJS.ReadableStream & { isTTY?: boolean };
  output: NodeJS.WritableStream;
  errorOutput?: NodeJS.WritableStream;
  service?: TerminalTuiServiceLike;
  resolveDaemonService?: () => Promise<DaemonTuiServiceResolution | null>;
};

async function readStdin(input: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function outputToMessage(line: string, output: string): InkTuiPreviewMessage {
  return {
    role: line.startsWith("/") || line.startsWith("!") ? "tool" : "assistant",
    marker: line.startsWith("/") || line.startsWith("!") ? "$" : "*",
    text: output.trim() || `handled ${line}`,
    tone: line.startsWith("/") || line.startsWith("!") ? "accent" : "assistant",
  };
}

async function createInkService(input: InkTerminalTuiIo): Promise<{
  service: TerminalTuiServiceLike;
  app: AgentAppRuntimeDeps | null;
  startupIssue: Error | null;
}> {
  if (input.service) {
    return { service: input.service, app: null, startupIssue: null };
  }
  const resolved = await (input.resolveDaemonService ?? (() => resolveDaemonTuiService()))().catch(
    () => null,
  );
  if (resolved) {
    return { service: resolved.service, app: null, startupIssue: null };
  }
  try {
    const app = createAgentAppRuntime();
    return { service: new AgentService(app), app, startupIssue: null };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing environment variable: MODEL_ID")) {
      const app = createAgentAppRuntime({
        client: {} as OpenAI,
        model: "unset-model",
        promptSource: getStaticPromptSource(),
      });
      return {
        service: new AgentService(app),
        app,
        startupIssue: error,
      };
    }
    throw error;
  }
}

type ScheduledInkSession = {
  id: string;
  history: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
};

function isScheduledInkSession(session: unknown): session is ScheduledInkSession {
  const candidate = session as Partial<ScheduledInkSession> | null;
  return Boolean(
    candidate &&
      typeof candidate.id === "string" &&
      Array.isArray(candidate.history) &&
      candidate.runtimeState,
  );
}

function asyncEventToMessage(label: string, content: string): InkTuiPreviewMessage {
  return {
    role: "system",
    marker: "$",
    text: `${label}\n${content}`.trim(),
    tone: label.includes("error") ? "muted" : "accent",
  };
}

export function createInkRuntimeController(input: {
  service: TerminalTuiServiceLike;
  app?: AgentAppRuntimeDeps | null;
  startupIssue: Error | null;
  runtimeCoordinationService?: RuntimeCoordinationServiceLike;
}) {
  const { service, app, startupIssue } = input;
  const composer = new CliComposerStore();
  const paletteStore = new CliPaletteStore();
  const transcriptBrowser = new CliTranscriptBrowserStore();
  let activeSessionId: string | null = null;
  let workflow: CliWorkflowMode = "agent";
  let currentModel = service instanceof AgentService ? process.env.MODEL_ID?.trim() || "unset-model" : "daemon-host";
  let agentBusy = false;

  const submit = async (line: string): Promise<{ messages: InkTuiPreviewMessage[]; exit: boolean }> => {
    if (agentBusy) {
      return {
        exit: false,
        messages: [asyncEventToMessage("busy", "Agent is already running another request.")],
      };
    }
    agentBusy = true;
    const result = await handleTerminalTuiCommand({
      line,
      service,
      activeSessionId,
      model: currentModel,
      workflow,
      startupIssue,
      setModel: async (model) => {
        process.env.MODEL_ID = model;
        currentModel = model;
        return false;
      },
      setWorkflow: (nextWorkflow) => {
        workflow = nextWorkflow;
        return true;
      },
      composer,
      paletteStore,
      transcriptBrowser,
    }).finally(() => {
      agentBusy = false;
    });
    activeSessionId = result.activeSessionId;
    workflow = result.workflow;
    return {
      exit: result.exit,
      messages: result.output.trim()
        ? [outputToMessage(line, result.output)]
        : [createPreviewResponse(line)],
    };
  };

  const runScheduledTick = async (): Promise<InkTuiPreviewMessage[]> => {
    if (startupIssue) {
      return [];
    }
    if (!app) {
      const coordination =
        input.runtimeCoordinationService ?? DEFAULT_RUNTIME_COORDINATION_SERVICE;
      await coordination.tickScheduler();
      const dueCount = await coordination.peekScheduledPromptCount();
      if (dueCount === 0 || agentBusy) {
        return [];
      }
      const sessions = service.listSessions();
      let sessionId = activeSessionId ?? sessions.at(-1)?.id ?? null;
      if (!sessionId) {
        const created = await service.createSession();
        sessionId = created.id;
      }
      activeSessionId = sessionId;
      const messages = [
        asyncEventToMessage(
          "scheduled due",
          `${dueCount} scheduled prompt${dueCount === 1 ? "" : "s"} due now.`,
        ),
      ];
      agentBusy = true;
      try {
        const result = await service.chat({
          session_id: sessionId,
          message: "Handle any scheduled prompts that are due now.",
          include_scheduled_notifications: true,
        });
        const session = result.session as { id?: unknown } | undefined;
        if (typeof session?.id === "string") {
          activeSessionId = session.id;
        }
        if (result.ok === false) {
          const error = result.error as { message?: unknown } | undefined;
          messages.push(asyncEventToMessage("scheduled error", String(error?.message ?? "chat failed")));
        } else {
          const assistant = String(result.assistant ?? "").trim();
          messages.push(
            asyncEventToMessage(
              "scheduled",
              assistant || "Scheduled prompt processed without a text reply.",
            ),
          );
        }
        return messages;
      } catch (error) {
        messages.push(
          asyncEventToMessage(
            "scheduled error",
            error instanceof Error ? error.message : String(error),
          ),
        );
        return messages;
      } finally {
        agentBusy = false;
      }
    }
    const sessions = service.listSessions();
    let session =
      sessions.find((item) => item.id === activeSessionId) ??
      sessions.at(-1);
    if (!session) {
      const created = await service.createSession();
      activeSessionId = created.id;
      session = service.listSessions().find((item) => item.id === created.id);
    }
    if (!isScheduledInkSession(session)) {
      return [];
    }
    activeSessionId = session.id;
    const messages: InkTuiPreviewMessage[] = [];
    await runScheduledRound({
      isAgentBusy: () => agentBusy,
      setAgentBusy: (busy) => {
        agentBusy = busy;
      },
      history: session.history,
      runtimeState: session.runtimeState,
      client: app.client,
      model: currentModel,
      promptSource: app.promptSource,
      runtimeCoordinationService: app.runtimeCoordinationService,
      queryEngine: app.queryEngine,
      printAsyncEvent: (label, content) => {
        messages.push(asyncEventToMessage(label, content));
      },
    });
    return messages;
  };

  return { submit, runScheduledTick };
}

async function runScriptedInput(script: string, submit: (line: string) => Promise<{ messages: InkTuiPreviewMessage[]; exit: boolean }>): Promise<InkTuiPreviewMessage[]> {
  const messages: InkTuiPreviewMessage[] = [];
  for (const rawLine of script.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (line === "q" || line === "exit" || line === "\u001b" || line === "\u0003") {
      break;
    }
    messages.push({ role: "user", marker: ">", text: rawLine, tone: "user" });
    const result = await submit(rawLine);
    messages.push(...result.messages);
    if (result.exit) {
      break;
    }
  }
  return messages;
}

/** Start the Ink/TSX terminal CLI surface. */
export async function runInkTerminalTui(input: InkTerminalTuiIo): Promise<void> {
  const { service, app, startupIssue } = await createInkService(input);
  const controller = createInkRuntimeController({ service, app, startupIssue });
  if (!input.input.isTTY) {
    const script = await readStdin(input.input);
    const extraMessages = await runScriptedInput(script, controller.submit);
    const app = render(
      <InkTuiPreviewApp snapshot={buildInkTuiPreviewSnapshot({ extraMessages })} interactive={false} />,
      {
        stdin: input.input as ReadStream,
        stdout: input.output as WriteStream,
        stderr: input.errorOutput as WriteStream | undefined,
        exitOnCtrlC: false,
      },
    );
    app.unmount();
    return;
  }

  const snapshot = buildInkTuiPreviewSnapshot();

  await new Promise<void>((resolve) => {
    let settled = false;
    const renderOptions: Parameters<typeof render>[1] = {
      // Ink's public types are TTY-specific, while the CLI dispatcher keeps IO injectable.
      stdin: input.input as ReadStream,
      stdout: input.output as WriteStream,
      exitOnCtrlC: false,
      alternateScreen: true,
    };
    if (input.errorOutput) {
      renderOptions.stderr = input.errorOutput as WriteStream;
    }
    const app = render(<InkTuiPreviewApp snapshot={snapshot} onSubmitInput={async (line) => {
      const result = await controller.submit(line);
      if (result.exit) {
        finish();
      }
      return result.messages;
    }} onScheduledTick={controller.runScheduledTick} schedulerIntervalMs={RUNTIME_CONFIG.schedulerPollIntervalMs} onExit={() => finish()} />, {
      ...renderOptions,
    });

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      input.input.off("end", onEnd);
      app.unmount();
      resolve();
    };
    const onEnd = () => {
      if (!input.input.isTTY) {
        finish();
      }
    };

    input.input.on("end", onEnd);
    input.input.resume();
  });
}
