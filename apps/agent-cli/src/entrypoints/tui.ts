import * as process from "node:process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { AgentService } from "../agent-service.js";
import { createAgentAppRuntime, type AgentAppRuntimeDeps } from "../bootstrap/app-runtime.js";
import { dispatchCliCommand } from "../cli-commands.js";
import {
  collectCliConfigSnapshot,
  collectCliPermissionSnapshot,
  collectCliStatusSnapshot,
  collectCliUsageSnapshot,
  runCliDoctor,
} from "../cli-doctor.js";
import { setCliPermissionMode } from "../cli-permissions.js";
import {
  renderCliFooter,
  getCliUiTheme,
  mergeCliColumns,
  renderCliBadge,
  renderClearScreen,
  renderCliBanner,
  renderCliError,
  renderCliPanel,
  renderCliPrompt,
  renderCliSection,
  setCliUiTheme,
} from "../cli-ui.js";
import { createClient, getStaticPromptSource } from "../config.js";
import { runCliShellShortcut } from "../cli-shell.js";
import { compactMessages } from "../tools/context-compact.js";
import { addWorkspaceRoot } from "../workspace-roots.js";

export type TerminalTuiServiceLike = {
  bridgeManifest(): Record<string, unknown>;
  createSession(): { id: string };
  listSessions(): Array<{ id: string; busy: boolean; history: unknown[] }>;
  toolsMetadata(): Promise<Array<Record<string, string>>>;
  chat(input: { session_id?: string; message?: string }): Promise<Record<string, unknown>>;
  runToolByName?(name: string, argumentsJson: string): Promise<string>;
};

export type TerminalTuiState = {
  model: string;
  activeSessionId: string | null;
  sessionCount: number;
  toolCount: number;
  bridgeEndpoint: string;
  sessions?: Array<{ id: string; busy: boolean; messageCount: number; active: boolean }>;
  transcriptLines?: string[];
  activityLines?: string[];
  runtimeLines?: string[];
  footerSegments?: string[];
};

function formatSessionLine(session: { id: string; busy: boolean; messageCount: number; active: boolean }): string {
  const marker = session.active ? "*" : " ";
  const status = session.busy ? "busy" : "idle";
  return `${marker} ${session.id.slice(0, 10)} ${status} ${session.messageCount} msg`;
}

function summarizeTranscript(
  sessions: Array<{ id: string; busy: boolean; history: unknown[] }>,
  activeSessionId: string | null,
): string[] {
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? sessions.at(-1);
  const history = Array.isArray(activeSession?.history) ? activeSession.history : [];
  if (history.length === 0) {
    return ["No transcript yet. Type a prompt or run /help."];
  }
  return history.slice(-8).map((message) => {
    if (!message || typeof message !== "object") {
      return "system  <unknown message>";
    }
    const record = message as { role?: unknown; content?: unknown };
    const role = String(record.role ?? "system").padEnd(9);
    const content =
      typeof record.content === "string"
        ? record.content.replace(/\s+/g, " ").trim()
        : JSON.stringify(record.content ?? "");
    return `${role}${content || "(empty)"}`;
  });
}

function sanitizeActivityText(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

export function renderTerminalTuiDashboard(state: TerminalTuiState): string {
  const width = Math.max(96, process.stdout.columns ?? 120);
  const gap = 2;
  const leftWidth = 30;
  const rightWidth = 30;
  const mainWidth = Math.max(34, width - leftWidth - rightWidth - gap * 2);
  const header = renderCliBanner({
    title: "Agent CLI",
    workspace: process.cwd().split("/").filter(Boolean).pop() ?? process.cwd(),
    mode: "tui",
    model: state.model,
    sessionId: state.activeSessionId,
    commands: ["/help", "/status", "/permissions", "/cost", "/model", "/doctor"],
  });
  const leftColumn = [
    ...renderCliPanel({
      title: "Sessions",
      width: leftWidth,
      tone: "accent",
      minBodyLines: 10,
      lines:
        state.sessions && state.sessions.length > 0
          ? state.sessions.map((session) => formatSessionLine(session))
          : ["No sessions yet."],
    }),
    "",
    ...renderCliPanel({
      title: "Controls",
      width: leftWidth,
      tone: "neutral",
      minBodyLines: 9,
      lines: [
        "/help     command guide",
        "/clear    fresh session",
        "/redraw   repaint screen",
        "/use <id> switch session",
        "/status   runtime snapshot",
        "/permissions mode + approvals",
        "/cost     token + cost summary",
        "/model    switch active model",
        "/add-dir  add workspace root",
        "/doctor   local diagnostics",
        "!<cmd>    direct shell command",
        "/exit     leave the TUI",
      ],
    }),
  ];
  const centerColumn = [
    ...renderCliPanel({
      title: "Conversation",
      width: mainWidth,
      tone: "neutral",
      minBodyLines: 18,
      lines: state.transcriptLines ?? ["No transcript yet."],
    }),
  ];
  const rightColumn = [
    ...renderCliPanel({
      title: "Runtime",
      width: rightWidth,
      tone: "success",
      minBodyLines: 10,
      lines: state.runtimeLines ?? [
        `session count ${state.sessionCount}`,
        `tool count ${state.toolCount}`,
        `bridge ${state.bridgeEndpoint}`,
      ],
    }),
    "",
    ...renderCliPanel({
      title: "Activity",
      width: rightWidth,
      tone: "warning",
      minBodyLines: 17,
      lines: state.activityLines ?? ["Ready.", "Use natural language or slash commands."],
    }),
  ];
  const board = mergeCliColumns([leftColumn, centerColumn, rightColumn], gap).join("\n");
  return [
    header,
    `${renderCliBadge("full-screen", "accent")} ${renderCliBadge("tui", "success")} ${renderCliBadge(state.activeSessionId ? "session-live" : "session-empty", "warning")}`,
    "",
    board,
    "",
    renderCliFooter(state.footerSegments ?? [`model ${state.model}`, `sessions ${state.sessionCount}`, `tools ${state.toolCount}`], width),
    "",
  ].join("\n");
}

function replaceAgentServiceRuntime(service: TerminalTuiServiceLike, runtime: AgentAppRuntimeDeps): void {
  Object.assign(service as Record<string, unknown>, {
    client: runtime.client,
    model: runtime.model,
    promptSource: runtime.promptSource,
    toolService: runtime.toolService,
    deliveryService: runtime.deliveryService,
    hookService: runtime.hookService,
    memoryService: runtime.memoryService,
    notificationService: runtime.notificationService,
    modelPolicyService: runtime.modelPolicyService,
    observabilityService: runtime.observabilityService,
    runtimeCoordinationService: runtime.runtimeCoordinationService,
    runtimeServices: runtime.runtimeServices,
    queryEngine: runtime.queryEngine,
  });
}

async function captureConsoleOutput<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
  const originalLog = console.log;
  const logs: string[] = [];
  console.log = (...args: unknown[]) => {
    logs.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  try {
    return { result: await fn(), logs };
  } finally {
    console.log = originalLog;
  }
}

export async function handleTerminalTuiCommand(input: {
  line: string;
  service: TerminalTuiServiceLike;
  activeSessionId: string | null;
  model: string;
  startupIssue?: Error | null;
  setModel(model: string): Promise<boolean>;
}): Promise<{ activeSessionId: string | null; output: string; exit: boolean; clearScreen?: boolean; showBanner?: boolean }> {
  const command = await dispatchCliCommand(input.line, {
    activeSessionId: input.activeSessionId,
    createSession: () => input.service.createSession(),
    listSessions: () =>
      input.service.listSessions().map((session) => ({
        id: session.id,
        messageCount: session.history.length,
        busy: session.busy,
        active: session.id === input.activeSessionId,
      })),
    useSession: (sessionId) => input.service.listSessions().some((session) => session.id === sessionId),
    listTools: async () => input.service.toolsMetadata(),
    getStatus: async () =>
      collectCliStatusSnapshot({
        mode: "tui",
        activeSessionId: input.activeSessionId,
        sessionCount: input.service.listSessions().length,
        bridgeEndpoint: String(
          (input.service.bridgeManifest().endpoints as { events?: unknown } | undefined)?.events ?? "/events",
        ),
        toolMetadata: await input.service.toolsMetadata(),
        model: input.model,
      }),
    getConfig: () => collectCliConfigSnapshot({ model: input.model }),
    getPermissions: collectCliPermissionSnapshot,
    setPermissionMode: (mode) => {
      setCliPermissionMode(mode);
      return true;
    },
    getUsage: () => collectCliUsageSnapshot(input.model),
    compactSession: async (keepRecent) => {
      const session = input.service
        .listSessions()
        .find((item) => item.id === input.activeSessionId) ?? input.service.listSessions().at(-1);
      return compactMessages({ messages: (session?.history ?? []) as ChatCompletionMessageParam[] }, "manual", keepRecent);
    },
    getModel: () => input.model,
    setModel: input.setModel,
    addWorkspaceRoot,
    runDoctor: runCliDoctor,
    getTheme: () => getCliUiTheme(),
    setTheme: (theme) => {
      setCliUiTheme(theme);
      return true;
    },
  });
  if (command.handled) {
    return {
      activeSessionId: command.nextSessionId ?? input.activeSessionId,
      output: command.output,
      exit: Boolean(command.exit),
      clearScreen: command.clearScreen,
      showBanner: command.showBanner,
    };
  }

  const line = input.line.trim();
  if (!line) {
    return { activeSessionId: input.activeSessionId, output: "", exit: false };
  }

  if (line.startsWith("!")) {
    const toolRunner =
      input.service.runToolByName ??
      (input.service as { toolService?: { runToolByName(name: string, argumentsJson: string): Promise<string> } }).toolService
        ?.runToolByName?.bind(
          (input.service as { toolService?: { runToolByName(name: string, argumentsJson: string): Promise<string> } })
            .toolService,
        );
    if (!toolRunner) {
      return {
        activeSessionId: input.activeSessionId,
        output: renderCliError("shell unavailable", "direct shell mode is not available for this TUI service"),
        exit: false,
      };
    }
    return {
      activeSessionId: input.activeSessionId,
      output: await runCliShellShortcut(line.slice(1), toolRunner),
      exit: false,
    };
  }

  if (input.startupIssue) {
    return {
      activeSessionId: input.activeSessionId,
      output: renderCliError("model not ready", input.startupIssue.message, "set /model <id> before sending prompts"),
      exit: false,
    };
  }

  const { result, logs } = await captureConsoleOutput(() =>
    input.service.chat({
      session_id: input.activeSessionId ?? undefined,
      message: line,
    }),
  );
  const session = result.session as { id?: unknown } | undefined;
  const nextSessionId = typeof session?.id === "string" ? session.id : input.activeSessionId;
  if (result.ok === false) {
    const error = result.error as { message?: unknown } | undefined;
    return {
      activeSessionId: nextSessionId,
      output: [renderCliError("chat failed", String(error?.message ?? "chat failed")), ...logs].join("\n"),
      exit: false,
    };
  }
  return {
    activeSessionId: nextSessionId,
    output: [...logs, renderCliSection("Assistant", String(result.assistant ?? ""))].filter(Boolean).join("\n"),
    exit: false,
  };
}

export type TerminalTuiOptions = {
  service?: TerminalTuiServiceLike;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
};

export async function runTerminalTui(opts: TerminalTuiOptions = {}): Promise<void> {
  let service = opts.service;
  let startupIssue: Error | null = null;
  if (!service) {
    try {
      service = new AgentService(createAgentAppRuntime());
    } catch (error) {
      if (error instanceof Error && error.message.includes("Missing environment variable: MODEL_ID")) {
        startupIssue = error;
        service = new AgentService(
          createAgentAppRuntime({
            client: {} as OpenAI,
            model: "unset-model",
            promptSource: getStaticPromptSource(),
          }),
        );
      } else {
        throw error;
      }
    }
  }
  if (!service) {
    throw new Error("terminal tui service unavailable");
  }
  const input = opts.input ?? stdin;
  const output = opts.output ?? stdout;
  let activeSessionId: string | null = null;
  let currentModel = process.env.MODEL_ID?.trim() || "unset-model";
  let lastOutput =
    startupIssue?.message
      ? renderCliError("startup", startupIssue.message, "use /model <id> to activate the TUI")
      : "Ready. Use natural language to run the agent, or /help for local controls.";

  const setModel = async (model: string): Promise<boolean> => {
    try {
      process.env.MODEL_ID = model;
      currentModel = model;
      startupIssue = null;
      if (service instanceof AgentService) {
        replaceAgentServiceRuntime(
          service,
          createAgentAppRuntime({
            client: createClient(),
            model,
            promptSource: getStaticPromptSource(),
          }),
        );
      }
      return true;
    } catch {
      return false;
    }
  };

  const redraw = async () => {
    const sessions = service.listSessions();
    const tools = await service.toolsMetadata();
    const status = await collectCliStatusSnapshot({
      mode: "tui",
      activeSessionId,
      sessionCount: sessions.length,
      bridgeEndpoint: String(
        (service.bridgeManifest().endpoints as { events?: unknown } | undefined)?.events ?? "/events",
      ),
      toolMetadata: tools,
      model: currentModel,
    });
    const activityLines = lastOutput
      .split("\n")
      .map((line) => sanitizeActivityText(line))
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 14);

    output.write(
      `${renderClearScreen()}${renderTerminalTuiDashboard({
        model: currentModel,
        activeSessionId,
        sessionCount: sessions.length,
        toolCount: tools.length,
        bridgeEndpoint: status.bridgeEndpoint,
        sessions: sessions.map((session) => ({
          id: session.id,
          busy: session.busy,
          messageCount: session.history.length,
          active: session.id === activeSessionId,
        })),
        transcriptLines: summarizeTranscript(sessions, activeSessionId),
        activityLines,
        runtimeLines: [
          `workspace  ${status.workspace}`,
          `model      ${status.model}`,
          `session    ${status.activeSessionId ?? "(none)"}`,
          `perm       ${status.permissionMode} / ${status.pendingApprovals} pending`,
          `roots      ${status.workspaceRoots.length}`,
          `tools      ${status.toolCount}`,
          `mcp        ${status.mcpToolCount} tools / ${status.mcpServerCount} servers`,
          `hooks      ${status.hookCount}`,
          `usage      ${status.sessionPromptTokens + status.sessionCompletionTokens} session tokens`,
          `bridge     ${status.bridgeEndpoint}`,
          `scheduler  ${status.schedulerStatus}`,
          `theme      ${status.theme}`,
        ],
        footerSegments: [
          `model ${status.model}`,
          `permissions ${status.permissionMode}`,
          `approvals ${status.pendingApprovals}`,
          `roots ${status.workspaceRoots.length}`,
          `session ${status.sessionPromptTokens + status.sessionCompletionTokens}/${status.sessionTokenBudget} tok`,
          `daily $${status.dailyEstimatedCostUsd.toFixed(status.dailyEstimatedCostUsd >= 1 ? 2 : 4)}`,
        ],
      })}`,
    );
  };

  await redraw();

  const rl = createInterface({ input, output });
  try {
    while (true) {
      const line = await rl.question(renderCliPrompt(activeSessionId));
      const result = await handleTerminalTuiCommand({
        line,
        service,
        activeSessionId,
        model: currentModel,
        startupIssue,
        setModel,
      });
      activeSessionId = result.activeSessionId;
      if (result.output) {
        lastOutput = result.output;
      }
      if (result.exit) {
        break;
      }
      await redraw();
    }
  } finally {
    rl.close();
  }
}
