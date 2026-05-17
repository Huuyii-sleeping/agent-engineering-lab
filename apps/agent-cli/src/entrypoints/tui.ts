import * as process from "node:process";
import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { AgentService } from "../service-api/index.js";
import { resolveRunningDaemonServiceClient } from "../service-api/daemon-client.js";
import { createAgentAppRuntime, type AgentAppRuntimeDeps } from "../bootstrap/app-runtime.js";
import { AgentHost } from "../host/agent-host.js";
import { dispatchCliCommand } from "../cli/commands.js";
import { completeCliLine } from "../cli/completion.js";
import { CliComposerStore } from "../cli/composer.js";
import {
  CliPaletteStore,
  getCliPaletteGroupLabel,
  type CliPaletteCandidate,
  type CliPaletteContext,
  type CliPaletteView,
} from "../cli/palette.js";
import {
  collectCliConfigSnapshot,
  collectCliPermissionSnapshot,
  collectCliStatusSnapshot,
  collectCliUsageSnapshot,
  runCliDoctor,
} from "../cli/doctor.js";
import { setCliPermissionMode } from "../cli/permissions.js";
import {
  listCliHelpTopics,
  renderCliFooter,
  renderCliComposerLines,
  getCliUiTheme,
  mergeCliColumns,
  renderCliGuideLines,
  renderCliBadge,
  renderClearScreen,
  renderCliBanner,
  renderCliError,
  renderCliPanel,
  renderCliPrompt,
  renderCliSection,
  renderCliShortcutLines,
  renderCliTranscriptLines,
  setCliUiTheme,
} from "../cli/ui.js";
import { createClient, getStaticPromptSource } from "../config.js";
import { exportProtectedPromptDump, inspectPromptSource } from "../prompt/inspect.js";
import { runCliShellShortcut } from "../cli/shell.js";
import { CliTranscriptBrowserStore } from "../cli/transcript.js";
import type { CliWorkflowMode } from "../cli/workflow.js";
import { getSkillCatalog, loadSkill } from "../skills/loader.js";
import { compactMessages } from "../tools/context-compact.js";
import { addWorkspaceRoot } from "../workspace-roots.js";

export type TerminalTuiServiceLike = {
  bridgeManifest(): Record<string, unknown>;
  createSession(): { id: string } | Promise<{ id: string }>;
  listSessions(): Array<{ id: string; busy: boolean; history: unknown[] }>;
  toolsMetadata(): Promise<Array<Record<string, string>>>;
  chat(input: { session_id?: string; message?: string }): Promise<Record<string, unknown>>;
  runToolByName?(name: string, argumentsJson: string): Promise<string>;
};

export type DaemonTuiServiceResolution = {
  service: TerminalTuiServiceLike;
  notice: string;
};

export async function resolveDaemonTuiService(
  runtimeRoot?: string,
): Promise<DaemonTuiServiceResolution | null> {
  const resolved = await resolveRunningDaemonServiceClient({ runtimeRoot });
  if (!resolved) {
    return null;
  }
  const sessionCount = resolved.client.listSessions().length;
  const statusBits = [
    typeof resolved.status.pid === "number" ? `pid=${resolved.status.pid}` : null,
    `${sessionCount} shared session${sessionCount === 1 ? "" : "s"}`,
  ].filter(Boolean);

  return {
    service: resolved.client,
    notice: `Connected to daemon${statusBits.length ? ` (${statusBits.join(" ")})` : ""}`,
  };
}

function getToolRunner(
  service: TerminalTuiServiceLike,
): ((name: string, argumentsJson: string) => Promise<string>) | null {
  return (
    service.runToolByName ??
    (
      service as {
        toolService?: { runToolByName(name: string, argumentsJson: string): Promise<string> };
      }
    ).toolService?.runToolByName?.bind(
      (
        service as {
          toolService?: { runToolByName(name: string, argumentsJson: string): Promise<string> };
        }
      ).toolService,
    ) ??
    null
  );
}

export type TerminalTuiState = {
  model: string;
  workflow?: CliWorkflowMode;
  activeSessionId: string | null;
  composerActive?: boolean;
  composerLineCount?: number;
  composerCharCount?: number;
  draftLines?: string[];
  sessionCount: number;
  toolCount: number;
  bridgeEndpoint: string;
  sessions?: Array<{ id: string; busy: boolean; messageCount: number; active: boolean }>;
  transcriptLines?: string[];
  activityLines?: string[];
  runtimeLines?: string[];
  guideLines?: string[];
  shortcutLines?: string[];
  footerSegments?: string[];
  paletteOpen?: boolean;
  paletteBarLines?: string[];
  paletteLines?: string[];
};

export type TerminalTuiShortcutKey = {
  ctrl?: boolean;
  name?: string;
  sequence?: string;
};

export type TerminalTuiShortcut = {
  command: string;
  label: string;
};

export type TerminalTuiPaletteState = {
  open: boolean;
  query: string;
  selectedIndex: number;
  view: CliPaletteView;
};

const EMPTY_TUI_PALETTE_VIEW: CliPaletteView = {
  query: "",
  candidates: [],
  total: 0,
};

export function createTerminalTuiPaletteState(): TerminalTuiPaletteState {
  return {
    open: false,
    query: "",
    selectedIndex: 0,
    view: EMPTY_TUI_PALETTE_VIEW,
  };
}

export function updateTerminalTuiPaletteState(input: {
  state: TerminalTuiPaletteState;
  view: CliPaletteView;
  open?: boolean;
  selectedIndex?: number;
}): TerminalTuiPaletteState {
  const nextOpen = input.open ?? input.state.open;
  const requestedIndex = input.selectedIndex ?? input.state.selectedIndex;
  const maxIndex = Math.max(0, input.view.candidates.length - 1);
  return {
    open: nextOpen,
    query: input.view.query,
    selectedIndex:
      input.view.candidates.length === 0 ? 0 : Math.max(0, Math.min(requestedIndex, maxIndex)),
    view: input.view,
  };
}

export function moveTerminalTuiPaletteSelection(
  state: TerminalTuiPaletteState,
  delta: number,
): TerminalTuiPaletteState {
  if (state.view.candidates.length === 0) {
    return state;
  }
  const maxIndex = state.view.candidates.length - 1;
  const nextIndex =
    (state.selectedIndex + delta + state.view.candidates.length) % state.view.candidates.length;
  return {
    ...state,
    selectedIndex: Math.max(0, Math.min(nextIndex, maxIndex)),
  };
}

export function resolveTerminalTuiPaletteLiveQuery(
  currentLine: string,
  key: TerminalTuiShortcutKey,
): string | null {
  const current = currentLine ?? "";
  if (key.name === "backspace" || key.name === "delete") {
    return current.slice(0, -1);
  }
  if (key.ctrl || !key.sequence || key.sequence.length !== 1) {
    return null;
  }
  if (
    key.name === "return" ||
    key.name === "enter" ||
    key.name === "tab" ||
    key.name === "escape"
  ) {
    return null;
  }
  return `${current}${key.sequence}`;
}

export function getTerminalTuiSelectedPaletteCandidate(
  state: TerminalTuiPaletteState,
): CliPaletteCandidate | null {
  return state.view.candidates[state.selectedIndex] ?? null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightTerminalTuiPaletteQuery(value: string, query: string): string {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return value;
  }
  let next = value;
  for (const token of tokens) {
    next = next.replace(new RegExp(escapeRegExp(token), "gi"), (match) => `<<${match}>>`);
  }
  return next;
}

function renderTerminalTuiPaletteCandidateLine(
  candidate: CliPaletteCandidate,
  index: number,
  selectedIndex: number,
  query: string,
): string {
  const marker = index === selectedIndex ? ">" : " ";
  return `${marker} [${index + 1}] ${highlightTerminalTuiPaletteQuery(candidate.command, query)}  |  ${highlightTerminalTuiPaletteQuery(candidate.title, query)}`;
}

function formatTerminalTuiPaletteFocus(state: TerminalTuiPaletteState): string {
  const selected = getTerminalTuiSelectedPaletteCandidate(state);
  if (!selected) {
    return "(none)";
  }
  return `[${state.selectedIndex + 1}/${state.view.candidates.length}] ${getCliPaletteGroupLabel(selected.group)} ${selected.command}`;
}

export function renderTerminalTuiPaletteLines(
  state: TerminalTuiPaletteState,
  maxEntries = 6,
): string[] {
  const visibleCandidates = state.view.candidates.slice(0, maxEntries);
  const groupedLines: string[] = [];
  let currentGroup: CliPaletteCandidate["group"] | null = null;
  for (const [index, candidate] of visibleCandidates.entries()) {
    if (candidate.group !== currentGroup) {
      if (groupedLines.length > 0) {
        groupedLines.push("");
      }
      currentGroup = candidate.group;
      groupedLines.push(`group     ${getCliPaletteGroupLabel(candidate.group)}`);
    }
    groupedLines.push(
      renderTerminalTuiPaletteCandidateLine(candidate, index, state.selectedIndex, state.query),
    );
  }
  if (state.view.candidates.length > visibleCandidates.length) {
    groupedLines.push(
      "",
      `more      +${state.view.candidates.length - visibleCandidates.length} candidate(s)`,
    );
  }
  return [
    `query     ${state.query || "(top actions)"}`,
    `results   ${state.view.candidates.length} shown / ${state.view.total} total`,
    "keys      Enter open | Up/Down/^N/^P move | Esc close",
    "",
    ...(state.view.candidates.length > 0 ? groupedLines : ["No palette candidates found."]),
  ];
}

export function resolveTerminalTuiShortcut(input: {
  key: TerminalTuiShortcutKey;
  bufferEmpty: boolean;
  composerActive: boolean;
}): TerminalTuiShortcut | null {
  if (!input.bufferEmpty) {
    return null;
  }
  if (input.key.ctrl && input.key.name === "g") {
    return { command: "/help", label: "ctrl+g" };
  }
  if (input.key.ctrl && input.key.name === "k") {
    return { command: "/palette", label: "ctrl+k" };
  }
  if (input.key.ctrl && input.key.name === "n") {
    return { command: "/next", label: "ctrl+n" };
  }
  if (input.key.ctrl && input.key.name === "p") {
    return { command: "/prev", label: "ctrl+p" };
  }
  if (input.key.ctrl && input.key.name === "l") {
    return { command: "/redraw", label: "ctrl+l" };
  }
  if (input.composerActive && input.key.name === "escape") {
    return { command: "/cancel", label: "esc" };
  }
  return null;
}

function formatSessionLine(
  session: { id: string; busy: boolean; messageCount: number; active: boolean },
  index: number,
): string {
  const marker = session.active ? "*" : " ";
  const status = session.busy ? "busy" : "idle";
  return `${marker} [${index + 1}] ${session.id.slice(0, 10)} ${status} ${session.messageCount} msg`;
}

function sanitizeActivityText(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(new RegExp("\\u001b\\[[0-9;]*m", "g"), "");
}

function visibleLength(value: string): number {
  // eslint-disable-next-line no-control-regex
  return value.replace(new RegExp("\\u001b\\[[0-9;]*m", "g"), "").length;
}

function centerTerminalTuiBlock(lines: string[], width: number): string[] {
  return lines.map((line) => {
    const padding = Math.max(0, Math.floor((width - visibleLength(line)) / 2));
    return `${" ".repeat(padding)}${line}`;
  });
}

export function renderTerminalTuiPaletteBarLines(state: TerminalTuiPaletteState): string[] {
  const selected = getTerminalTuiSelectedPaletteCandidate(state);
  return [
    `input     ${state.query || "(top actions)"}`,
    `focus     ${formatTerminalTuiPaletteFocus(state)}`,
    `preview   ${selected ? highlightTerminalTuiPaletteQuery(selected.summary, state.query) : "no candidate selected"}`,
  ];
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
    mode: state.workflow ? `tui/${state.workflow}` : "tui",
    model: state.model,
    sessionId: state.activeSessionId,
    commands: ["/help", "/workflow", "/palette", "^G", "^K", "/next", "/compose", "/status"],
  });
  const leftColumn = [
    ...renderCliPanel({
      title: "Sessions",
      width: leftWidth,
      tone: "accent",
      minBodyLines: 10,
      lines:
        state.sessions && state.sessions.length > 0
          ? [
              ...state.sessions.map((session, index) => formatSessionLine(session, index)),
              "",
              "/use 2  /next  /prev",
            ]
          : ["No sessions yet.", "", "/clear to create one"],
    }),
    "",
    ...renderCliPanel({
      title: "Guide",
      width: leftWidth,
      tone: "neutral",
      minBodyLines: 8,
      lines: state.guideLines ?? ["help      /help /help draft /help sessions"],
    }),
    "",
    ...renderCliPanel({
      title: "Shortcuts",
      width: leftWidth,
      tone: "accent",
      minBodyLines: 5,
      lines: state.shortcutLines ?? [
        "ctrl+g    help",
        "ctrl+k    palette",
        "ctrl+n    next session",
        "ctrl+p    previous session",
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
  const draftPanel = state.composerActive
    ? [
        "",
        ...renderCliPanel({
          title: "Draft",
          width: rightWidth,
          tone: "accent",
          minBodyLines: 8,
          lines:
            state.draftLines && state.draftLines.length > 0
              ? state.draftLines
              : [
                  `draft ${state.composerLineCount ?? 0} lines / ${state.composerCharCount ?? 0} chars`,
                  "Use plain input to append.",
                  "/preview /send /pop /cancel",
                ],
        }),
      ]
    : [];
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
    ...draftPanel,
    "",
    ...renderCliPanel({
      title: "Activity",
      width: rightWidth,
      tone: "warning",
      minBodyLines: state.composerActive ? 10 : 17,
      lines: state.activityLines ?? [
        "Ready.",
        "Use natural language, or start /compose for drafts.",
      ],
    }),
  ];
  const board = mergeCliColumns([leftColumn, centerColumn, rightColumn], gap).join("\n");
  const paletteOverlayWidth = Math.max(48, Math.min(80, width - 16));
  const paletteBar = state.paletteOpen
    ? centerTerminalTuiBlock(
        renderCliPanel({
          title: "Command Bar",
          width: paletteOverlayWidth,
          tone: "accent",
          minBodyLines: 3,
          lines: state.paletteBarLines ?? ["input     (top actions)"],
        }),
        width,
      )
    : [];
  const paletteOverlay = state.paletteOpen
    ? centerTerminalTuiBlock(
        renderCliPanel({
          title: "Palette Results",
          width: paletteOverlayWidth,
          tone: "accent",
          minBodyLines: 6,
          lines: state.paletteLines ?? ["No palette candidates found."],
        }),
        width,
      )
    : [];
  return [
    header,
    `${renderCliBadge("full-screen", "accent")} ${renderCliBadge("tui", "success")} ${renderCliBadge(state.activeSessionId ? "session-live" : "session-empty", "warning")}${state.paletteOpen ? ` ${renderCliBadge("palette-live", "accent")}` : ""}`,
    "",
    ...paletteBar,
    ...paletteOverlay,
    ...(paletteOverlay.length > 0 ? [""] : []),
    board,
    "",
    renderCliFooter(
      state.footerSegments ?? [
        `model ${state.model}`,
        `sessions ${state.sessionCount}`,
        `tools ${state.toolCount}`,
      ],
      width,
    ),
    "",
  ].join("\n");
}

function replaceAgentServiceRuntime(
  service: TerminalTuiServiceLike,
  runtime: AgentAppRuntimeDeps,
): void {
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

async function captureConsoleOutput<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; logs: string[] }> {
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
  workflow?: CliWorkflowMode;
  startupIssue?: Error | null;
  setModel(model: string): Promise<boolean>;
  setWorkflow?(mode: CliWorkflowMode): boolean;
  composer: CliComposerStore;
  transcriptBrowser?: CliTranscriptBrowserStore;
  paletteStore?: CliPaletteStore;
}): Promise<{
  activeSessionId: string | null;
  workflow: CliWorkflowMode;
  output: string;
  exit: boolean;
  clearScreen?: boolean;
  showBanner?: boolean;
}> {
  const transcriptBrowser = input.transcriptBrowser ?? new CliTranscriptBrowserStore();
  const paletteStore = input.paletteStore ?? new CliPaletteStore();
  const toolRunner = getToolRunner(input.service);
  let workflow = input.workflow ?? "agent";
  const listSessionSummaries = () =>
    input.service.listSessions().map((session) => ({
      id: session.id,
      messageCount: session.history.length,
      busy: session.busy,
      active: session.id === input.activeSessionId,
    }));
  let command: Awaited<ReturnType<typeof dispatchCliCommand>>;
  try {
    command = await dispatchCliCommand(input.line, {
      activeSessionId: input.activeSessionId,
      createSession: async () => input.service.createSession(),
      listSessions: listSessionSummaries,
      useSession: (sessionId) =>
        input.service.listSessions().some((session) => session.id === sessionId),
      listTools: async () => input.service.toolsMetadata(),
      getStatus: async () =>
        collectCliStatusSnapshot({
          mode: `tui/${workflow}`,
          activeSessionId: input.activeSessionId,
          sessionCount: input.service.listSessions().length,
          bridgeEndpoint: String(
            (input.service.bridgeManifest().endpoints as { events?: unknown } | undefined)
              ?.events ?? "/events",
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
      listApprovals: async (status) => {
        if (!toolRunner) {
          return JSON.stringify({
            ok: false,
            error: { message: "security tools are not available for this TUI service" },
          });
        }
        return toolRunner("security_list_approvals", JSON.stringify(status ? { status } : {}));
      },
      approveRequest: async (requestId) => {
        if (!toolRunner) {
          return JSON.stringify({
            ok: false,
            error: { message: "security tools are not available for this TUI service" },
          });
        }
        return toolRunner("security_approve", JSON.stringify({ request_id: requestId }));
      },
      rejectRequest: async (requestId) => {
        if (!toolRunner) {
          return JSON.stringify({
            ok: false,
            error: { message: "security tools are not available for this TUI service" },
          });
        }
        return toolRunner("security_reject", JSON.stringify({ request_id: requestId }));
      },
      listSkills: async () => {
        const catalog = getSkillCatalog();
        return {
          skills: catalog.available,
          loadedNames: catalog.loadedNames,
          missingNames: catalog.missingNames,
        };
      },
      getSkill: async (name) => {
        const skill = loadSkill(name);
        if (!skill) {
          return null;
        }
        const catalog = getSkillCatalog();
        return {
          name: skill.name,
          description: skill.description,
          path: skill.path,
          root: skill.root,
          metadata: skill.metadata,
          content: skill.content,
          loaded: catalog.loadedNames.some(
            (loadedName) => loadedName.toLowerCase() === skill.name.toLowerCase(),
          ),
        };
      },
      dumpSystemPrompt: async (mode = "default") => {
        const catalog = getSkillCatalog();
        return {
          dump:
            mode === "protected"
              ? await exportProtectedPromptDump(getStaticPromptSource())
              : inspectPromptSource(getStaticPromptSource(), mode),
          loadedNames: catalog.loadedNames,
          missingNames: catalog.missingNames,
        };
      },
      getUsage: () => collectCliUsageSnapshot(input.model),
      canCompactSession: () => true,
      compactSession: async (keepRecent) => {
        const session =
          input.service.listSessions().find((item) => item.id === input.activeSessionId) ??
          input.service.listSessions().at(-1);
        return compactMessages(
          { messages: (session?.history ?? []) as ChatCompletionMessageParam[] },
          "manual",
          keepRecent,
        );
      },
      isComposing: () => input.composer.isActive(input.activeSessionId),
      getComposeLineCount: () => input.composer.lineCount(input.activeSessionId),
      getComposeCharCount: () => input.composer.preview(input.activeSessionId)?.charCount ?? 0,
      startCompose: () => input.composer.start(input.activeSessionId),
      appendComposeLine: (line) => input.composer.append(input.activeSessionId, line),
      previewCompose: () => input.composer.preview(input.activeSessionId),
      popCompose: (count) => input.composer.pop(input.activeSessionId, count),
      sendCompose: () => input.composer.consume(input.activeSessionId),
      cancelCompose: () => input.composer.cancel(input.activeSessionId),
      getModel: () => input.model,
      setModel: input.setModel,
      addWorkspaceRoot,
      runDoctor: runCliDoctor,
      getTheme: () => getCliUiTheme(),
      setTheme: (theme) => {
        setCliUiTheme(theme);
        return true;
      },
      getWorkflow: () => workflow,
      setWorkflow: (nextWorkflow) => {
        workflow = nextWorkflow;
        return input.setWorkflow ? input.setWorkflow(nextWorkflow) : true;
      },
      showPalette: async (query = "") =>
        paletteStore.search(
          input.activeSessionId,
          {
            sessions: listSessionSummaries(),
            helpTopics: listCliHelpTopics(),
            composerActive: input.composer.isActive(input.activeSessionId),
            pendingApprovals: (await collectCliPermissionSnapshot()).pendingApprovals,
            workflow,
          },
          query,
        ),
      openPalette: (index) => paletteStore.open(input.activeSessionId, index),
      showTranscript: (direction = "current") => {
        const session =
          input.service.listSessions().find((item) => item.id === input.activeSessionId) ??
          input.service.listSessions().at(-1);
        return transcriptBrowser.history(input.activeSessionId, session?.history ?? [], direction);
      },
      searchTranscript: (query) => {
        const session =
          input.service.listSessions().find((item) => item.id === input.activeSessionId) ??
          input.service.listSessions().at(-1);
        return transcriptBrowser.search(input.activeSessionId, session?.history ?? [], query);
      },
      moveTranscriptSearch: (direction) => {
        const session =
          input.service.listSessions().find((item) => item.id === input.activeSessionId) ??
          input.service.listSessions().at(-1);
        return transcriptBrowser.moveSearch(
          input.activeSessionId,
          session?.history ?? [],
          direction,
        );
      },
      peekTranscript: (entryIndex) => {
        const session =
          input.service.listSessions().find((item) => item.id === input.activeSessionId) ??
          input.service.listSessions().at(-1);
        return transcriptBrowser.peek(input.activeSessionId, session?.history ?? [], entryIndex);
      },
      moveTranscriptPeek: (direction) => {
        const session =
          input.service.listSessions().find((item) => item.id === input.activeSessionId) ??
          input.service.listSessions().at(-1);
        return transcriptBrowser.peekRelative(
          input.activeSessionId,
          session?.history ?? [],
          direction,
        );
      },
      tailTranscript: () => {
        const session =
          input.service.listSessions().find((item) => item.id === input.activeSessionId) ??
          input.service.listSessions().at(-1);
        return transcriptBrowser.tail(input.activeSessionId, session?.history ?? []);
      },
    });
  } catch (error) {
    return {
      activeSessionId: input.activeSessionId,
      workflow,
      output: renderCliError(
        "command failed",
        error instanceof Error ? error.message : String(error),
      ),
      exit: false,
    };
  }
  if (command.handled) {
    if (!command.submitPrompt) {
      return {
        activeSessionId: command.nextSessionId ?? input.activeSessionId,
        workflow,
        output: command.output,
        exit: Boolean(command.exit),
        clearScreen: command.clearScreen,
        showBanner: command.showBanner,
      };
    }
    const nextSessionId = command.nextSessionId ?? input.activeSessionId;
    const prompt = command.submitPrompt;
    const prefixOutput = command.output ? [command.output] : [];
    if (input.startupIssue) {
      return {
        activeSessionId: nextSessionId,
        workflow,
        output: [
          ...prefixOutput,
          renderCliError(
            "model not ready",
            input.startupIssue.message,
            "set /model <id> before sending prompts",
          ),
        ].join("\n"),
        exit: false,
        clearScreen: command.clearScreen,
        showBanner: command.showBanner,
      };
    }
    let sessionResult;
    try {
      sessionResult = await captureConsoleOutput(() =>
        input.service.chat({
          session_id: nextSessionId ?? undefined,
          message: prompt,
        }),
      );
    } catch (error) {
      return {
        activeSessionId: nextSessionId,
        workflow,
        output: [
          ...prefixOutput,
          renderCliError("chat failed", error instanceof Error ? error.message : String(error)),
        ].join("\n"),
        exit: false,
        clearScreen: command.clearScreen,
        showBanner: command.showBanner,
      };
    }
    const session = sessionResult.result.session as { id?: unknown } | undefined;
    const resolvedSessionId = typeof session?.id === "string" ? session.id : nextSessionId;
    if (sessionResult.result.ok === false) {
      const error = sessionResult.result.error as { message?: unknown } | undefined;
      return {
        activeSessionId: resolvedSessionId,
        workflow,
        output: [
          ...prefixOutput,
          renderCliError("chat failed", String(error?.message ?? "chat failed")),
          ...sessionResult.logs,
        ].join("\n"),
        exit: false,
        clearScreen: command.clearScreen,
        showBanner: command.showBanner,
      };
    }
    return {
      activeSessionId: resolvedSessionId,
      workflow,
      output: [
        ...prefixOutput,
        ...sessionResult.logs,
        renderCliSection("Assistant", String(sessionResult.result.assistant ?? "")),
      ]
        .filter(Boolean)
        .join("\n"),
      exit: false,
      clearScreen: command.clearScreen,
      showBanner: command.showBanner,
    };
  }

  const line = input.line.trim();
  if (!line) {
    return { activeSessionId: input.activeSessionId, workflow, output: "", exit: false };
  }

  if (line.startsWith("!")) {
    if (!toolRunner) {
      return {
        activeSessionId: input.activeSessionId,
        workflow,
        output: renderCliError(
          "shell unavailable",
          "direct shell mode is not available for this TUI service",
        ),
        exit: false,
      };
    }
    return {
      activeSessionId: input.activeSessionId,
      workflow,
      output: await runCliShellShortcut(line.slice(1), toolRunner),
      exit: false,
    };
  }

  if (input.startupIssue) {
    return {
      activeSessionId: input.activeSessionId,
      workflow,
      output: renderCliError(
        "model not ready",
        input.startupIssue.message,
        "set /model <id> before sending prompts",
      ),
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
      workflow,
      output: [
        renderCliError("chat failed", String(error?.message ?? "chat failed")),
        ...logs,
      ].join("\n"),
      exit: false,
    };
  }
  return {
    activeSessionId: nextSessionId,
    workflow,
    output: [...logs, renderCliSection("Assistant", String(result.assistant ?? ""))]
      .filter(Boolean)
      .join("\n"),
    exit: false,
  };
}

export type TerminalTuiOptions = {
  service?: TerminalTuiServiceLike;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  host?: Pick<AgentHost, "initialize" | "runtime">;
  resolveDaemonService?: () => Promise<DaemonTuiServiceResolution | null>;
};

export async function runTerminalTui(opts: TerminalTuiOptions = {}): Promise<void> {
  let service = opts.service;
  let startupIssue: Error | null = null;
  let attachNotice: string | null = null;
  if (!service) {
    if (!opts.host) {
      const resolveDaemonService = opts.resolveDaemonService ?? (() => resolveDaemonTuiService());
      try {
        const resolved = await resolveDaemonService();
        if (resolved) {
          service = resolved.service;
          attachNotice = resolved.notice;
        }
      } catch (error) {
        attachNotice = renderCliError(
          "daemon attach failed",
          error instanceof Error ? error.message : String(error),
          "falling back to embedded host",
        );
      }
    }
    if (opts.host && !service) {
      await opts.host.initialize();
      service = new AgentService(opts.host.runtime(), opts.host as AgentHost);
    } else if (!service) {
      try {
        service = new AgentService(createAgentAppRuntime());
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Missing environment variable: MODEL_ID")
        ) {
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
  }
  if (!service) {
    throw new Error("terminal tui service unavailable");
  }
  const input = opts.input ?? stdin;
  const output = opts.output ?? stdout;
  const composer = new CliComposerStore();
  const paletteStore = new CliPaletteStore();
  const transcriptBrowser = new CliTranscriptBrowserStore();
  let paletteState = createTerminalTuiPaletteState();
  let activeSessionId: string | null = null;
  let currentModel =
    service instanceof AgentService ? process.env.MODEL_ID?.trim() || "unset-model" : "daemon-host";
  let currentWorkflow: CliWorkflowMode = "agent";
  let lastOutput = startupIssue?.message
    ? renderCliError("startup", startupIssue.message, "use /model <id> to activate the TUI")
    : attachNotice
      ? `${attachNotice}\n\nReady. Use natural language to run the agent, or /help for local controls.`
      : "Ready. Use natural language to run the agent, or /help for local controls.";
  if (attachNotice && startupIssue?.message) {
    lastOutput = `${attachNotice}\n\n${lastOutput}`;
  }
  let waitingForInput = false;
  let shortcutBusy = false;

  const setModel = async (model: string): Promise<boolean> => {
    if (!(service instanceof AgentService)) {
      return false;
    }
    try {
      process.env.MODEL_ID = model;
      currentModel = model;
      startupIssue = null;
      replaceAgentServiceRuntime(
        service,
        createAgentAppRuntime({
          client: createClient(),
          model,
          promptSource: getStaticPromptSource(),
        }),
      );
      return true;
    } catch {
      return false;
    }
  };

  const promptText = () =>
    paletteState.open
      ? `palette:${activeSessionId ? activeSessionId.slice(0, 6) : "shell"} .. `
      : renderCliPrompt(
          activeSessionId,
          {
            active: composer.isActive(activeSessionId),
            lineCount: composer.lineCount(activeSessionId),
            charCount: composer.preview(activeSessionId)?.charCount ?? 0,
          },
          currentWorkflow,
        );

  const buildPaletteContext = async (): Promise<CliPaletteContext> => {
    const permissions = await collectCliPermissionSnapshot();
    return {
      sessions: service.listSessions().map((session) => ({
        id: session.id,
        messageCount: session.history.length,
        busy: session.busy,
        active: session.id === activeSessionId,
      })),
      helpTopics: listCliHelpTopics(),
      composerActive: composer.isActive(activeSessionId),
      pendingApprovals: permissions.pendingApprovals,
      workflow: currentWorkflow,
    };
  };

  const syncPaletteState = async (
    query = paletteState.query,
    selectedIndex = paletteState.selectedIndex,
  ) => {
    const view = paletteStore.search(activeSessionId, await buildPaletteContext(), query);
    paletteState = updateTerminalTuiPaletteState({
      state: paletteState,
      view,
      open: true,
      selectedIndex,
    });
  };

  const openPaletteState = async (query = "") => {
    await syncPaletteState(query, 0);
  };

  const closePaletteState = () => {
    paletteState = createTerminalTuiPaletteState();
  };

  const redraw = async (
    preservePrompt = false,
    lineEditor?: { line?: string; write(input: string): void },
  ) => {
    const sessions = service.listSessions();
    const activeSessionIndex = Math.max(
      0,
      sessions.findIndex((session) => session.id === activeSessionId),
    );
    const tools = await service.toolsMetadata();
    const draftPreview = composer.preview(activeSessionId);
    const activeTranscriptSession =
      sessions.find((session) => session.id === activeSessionId) ?? sessions.at(-1);
    const transcriptView = transcriptBrowser.getView(
      activeSessionId,
      activeTranscriptSession?.history ?? [],
    );
    const status = await collectCliStatusSnapshot({
      mode: `tui/${currentWorkflow}`,
      activeSessionId,
      sessionCount: sessions.length,
      bridgeEndpoint: String(
        (service.bridgeManifest().endpoints as { events?: unknown } | undefined)?.events ??
          "/events",
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
        workflow: currentWorkflow,
        activeSessionId,
        composerActive: composer.isActive(activeSessionId),
        composerLineCount: composer.lineCount(activeSessionId),
        composerCharCount: draftPreview?.charCount ?? 0,
        draftLines:
          composer.isActive(activeSessionId) && draftPreview
            ? [
                `summary  ${draftPreview.lineCount} lines / ${draftPreview.charCount} chars`,
                "actions  /preview /send /pop /cancel",
                "",
                ...renderCliComposerLines(draftPreview, 6),
              ]
            : undefined,
        sessionCount: sessions.length,
        toolCount: tools.length,
        bridgeEndpoint: status.bridgeEndpoint,
        sessions: sessions.map((session) => ({
          id: session.id,
          busy: session.busy,
          messageCount: session.history.length,
          active: session.id === activeSessionId,
        })),
        transcriptLines: renderCliTranscriptLines(transcriptView, 12),
        activityLines,
        runtimeLines: [
          `workspace  ${status.workspace}`,
          `model      ${status.model}`,
          `workflow   ${currentWorkflow}`,
          `session    ${status.activeSessionId ?? "(none)"}`,
          `position   ${sessions.length > 0 ? `${activeSessionIndex + 1}/${sessions.length}` : "0/0"}`,
          `draft      ${
            composer.isActive(activeSessionId)
              ? `${composer.lineCount(activeSessionId)} lines / ${draftPreview?.charCount ?? 0} chars`
              : "off"
          }`,
          `palette    ${paletteStore.lastCount(activeSessionId)} cached`,
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
        guideLines: renderCliGuideLines({
          composerActive: composer.isActive(activeSessionId),
          sessionCount: sessions.length,
          pendingApprovals: status.pendingApprovals,
          startupIssue: Boolean(startupIssue),
          workflow: currentWorkflow,
        }),
        shortcutLines: renderCliShortcutLines({
          composerActive: composer.isActive(activeSessionId),
        }),
        paletteOpen: paletteState.open,
        paletteBarLines: paletteState.open
          ? renderTerminalTuiPaletteBarLines(paletteState)
          : undefined,
        paletteLines: paletteState.open
          ? renderTerminalTuiPaletteLines(paletteState, 6)
          : undefined,
        footerSegments: [
          `model ${status.model}`,
          `workflow ${currentWorkflow}`,
          `session ${sessions.length > 0 ? `${activeSessionIndex + 1}/${sessions.length}` : "0/0"}`,
          "help /help ^G",
          paletteState.open ? "palette live ^K Esc Enter" : "palette /palette ^K",
          "switch /next /prev /use",
          "browse /history /search /peek /tail",
          "keys ^G ^K ^N ^P ^L Esc",
          `permissions ${status.permissionMode}`,
          composer.isActive(activeSessionId)
            ? `draft ${composer.lineCount(activeSessionId)}l/${draftPreview?.charCount ?? 0}c`
            : "draft off",
          composer.isActive(activeSessionId) ? "preview/send/pop/cancel" : "compose to draft",
          `approvals ${status.pendingApprovals}`,
          `roots ${status.workspaceRoots.length}`,
          `tokens ${status.sessionPromptTokens + status.sessionCompletionTokens}/${status.sessionTokenBudget}`,
          `daily $${status.dailyEstimatedCostUsd.toFixed(status.dailyEstimatedCostUsd >= 1 ? 2 : 4)}`,
        ],
      })}`,
    );
    if (preservePrompt) {
      output.write(promptText());
      const buffered = String(lineEditor?.line ?? "");
      if (buffered) {
        lineEditor?.write(buffered);
      }
    }
  };

  await redraw();

  const rl = createInterface({
    input,
    output,
    completer: (line: string) =>
      completeCliLine(line, {
        sessions: service.listSessions().map((session) => ({
          id: session.id,
          messageCount: session.history.length,
          busy: session.busy,
          active: session.id === activeSessionId,
        })),
        helpTopics: listCliHelpTopics(),
        transcriptEntryCount:
          (
            service.listSessions().find((session) => session.id === activeSessionId) ??
            service.listSessions().at(-1)
          )?.history.length ?? 0,
        paletteEntryCount: paletteStore.lastCount(activeSessionId),
        model: currentModel,
      }),
  });
  const lineEditor = rl as typeof rl & { line?: string; write(input: string): void };
  const interactiveInput = input as NodeJS.ReadableStream & {
    isTTY?: boolean;
    setRawMode?(enabled: boolean): void;
    on(
      event: "keypress",
      listener: (chunk: string, key: TerminalTuiShortcutKey) => void,
    ): NodeJS.ReadableStream;
    off?(
      event: "keypress",
      listener: (chunk: string, key: TerminalTuiShortcutKey) => void,
    ): NodeJS.ReadableStream;
  };
  let keypressListener: ((chunk: string, key: TerminalTuiShortcutKey) => void) | null = null;
  if (interactiveInput.isTTY && typeof interactiveInput.setRawMode === "function") {
    emitKeypressEvents(interactiveInput, rl);
    interactiveInput.setRawMode(true);
    keypressListener = (_chunk, key) => {
      if (!waitingForInput || shortcutBusy) {
        return;
      }
      if (paletteState.open) {
        if (key.name === "up" || (key.ctrl && key.name === "p")) {
          paletteState = moveTerminalTuiPaletteSelection(paletteState, -1);
          shortcutBusy = true;
          void redraw(true, lineEditor).finally(() => {
            shortcutBusy = false;
          });
          return;
        }
        if (key.name === "down" || (key.ctrl && key.name === "n")) {
          paletteState = moveTerminalTuiPaletteSelection(paletteState, 1);
          shortcutBusy = true;
          void redraw(true, lineEditor).finally(() => {
            shortcutBusy = false;
          });
          return;
        }
        if (key.name === "escape") {
          closePaletteState();
          shortcutBusy = true;
          void redraw(true, lineEditor).finally(() => {
            shortcutBusy = false;
          });
          return;
        }
        const nextQuery = resolveTerminalTuiPaletteLiveQuery(String(lineEditor.line ?? ""), key);
        if (nextQuery !== null) {
          shortcutBusy = true;
          setTimeout(() => {
            void (async () => {
              try {
                await syncPaletteState(nextQuery, 0);
                await redraw(true, lineEditor);
              } finally {
                shortcutBusy = false;
              }
            })();
          }, 0);
          return;
        }
      }
      const shortcut = resolveTerminalTuiShortcut({
        key,
        bufferEmpty: String(lineEditor.line ?? "").length === 0,
        composerActive: composer.isActive(activeSessionId),
      });
      if (!shortcut) {
        return;
      }
      shortcutBusy = true;
      void (async () => {
        try {
          if (shortcut.command === "/palette") {
            if (paletteState.open) {
              closePaletteState();
            } else {
              await openPaletteState();
            }
            await redraw(true, lineEditor);
            return;
          }
          const result = await handleTerminalTuiCommand({
            line: shortcut.command,
            service,
            activeSessionId,
            model: currentModel,
            workflow: currentWorkflow,
            startupIssue,
            setModel,
            setWorkflow: (nextWorkflow) => {
              currentWorkflow = nextWorkflow;
              return true;
            },
            composer,
            paletteStore,
            transcriptBrowser,
          });
          activeSessionId = result.activeSessionId;
          currentWorkflow = result.workflow;
          if (result.output) {
            lastOutput = result.output;
          }
          await redraw(true, lineEditor);
        } finally {
          shortcutBusy = false;
        }
      })();
    };
    interactiveInput.on("keypress", keypressListener);
  }
  try {
    while (true) {
      waitingForInput = true;
      const line = await rl.question(promptText());
      waitingForInput = false;
      const trimmedLine = line.trim();
      if (paletteState.open && !trimmedLine.startsWith("/")) {
        const selected = getTerminalTuiSelectedPaletteCandidate(paletteState);
        if (!selected) {
          lastOutput = renderCliError("palette empty", "there is no palette candidate to open");
          await redraw();
          continue;
        }
        const result = await handleTerminalTuiCommand({
          line: selected.command,
          service,
          activeSessionId,
          model: currentModel,
          workflow: currentWorkflow,
          startupIssue,
          setModel,
          setWorkflow: (nextWorkflow) => {
            currentWorkflow = nextWorkflow;
            return true;
          },
          composer,
          paletteStore,
          transcriptBrowser,
        });
        activeSessionId = result.activeSessionId;
        currentWorkflow = result.workflow;
        lastOutput = [
          `palette query '${paletteState.query || "(top actions)"}' [${paletteState.selectedIndex + 1}] -> ${selected.command}`,
          result.output,
        ]
          .filter(Boolean)
          .join("\n");
        closePaletteState();
        if (result.exit) {
          break;
        }
        await redraw();
        continue;
      }
      const result = await handleTerminalTuiCommand({
        line,
        service,
        activeSessionId,
        model: currentModel,
        workflow: currentWorkflow,
        startupIssue,
        setModel,
        setWorkflow: (nextWorkflow) => {
          currentWorkflow = nextWorkflow;
          return true;
        },
        composer,
        paletteStore,
        transcriptBrowser,
      });
      if (/^\/palette(?:\s|$)/i.test(trimmedLine) && !/^\/palette\s+open\s+/i.test(trimmedLine)) {
        await openPaletteState(trimmedLine.replace(/^\/palette/i, "").trim());
      } else if (trimmedLine && !/^\/palette(?:\s|$)/i.test(trimmedLine)) {
        closePaletteState();
      }
      activeSessionId = result.activeSessionId;
      currentWorkflow = result.workflow;
      if (result.output) {
        lastOutput = result.output;
      }
      if (result.exit) {
        break;
      }
      await redraw();
    }
  } finally {
    waitingForInput = false;
    if (keypressListener && interactiveInput.off) {
      interactiveInput.off("keypress", keypressListener);
    }
    if (interactiveInput.isTTY && typeof interactiveInput.setRawMode === "function") {
      interactiveInput.setRawMode(false);
    }
    rl.close();
  }
}
