import path from "node:path";
import * as process from "node:process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createAgentSessionRecord, type AgentSessionRecord } from "../service-api/sessions.js";
import {
  getInteractiveCliBridgeEndpoint,
  getInteractiveCliToolRunner,
  resolveDaemonCliService,
  type DaemonCliServiceResolution,
  type InteractiveCliServiceLike,
} from "./service-adapter.js";
import { createAgentAppRuntime, type AgentAppRuntimeDeps } from "../bootstrap/app-runtime.js";
import { dispatchCliCommand } from "./commands.js";
import { completeCliLine } from "./completion.js";
import { CliComposerStore } from "./composer.js";
import { CliPaletteStore } from "./palette.js";
import {
  collectCliConfigSnapshot,
  collectCliPermissionSnapshot,
  collectCliStatusSnapshot,
  collectCliUsageSnapshot,
  runCliDoctor,
} from "./doctor.js";
import { setCliPermissionMode } from "./permissions.js";
import {
  listCliHelpTopics,
  getCliUiTheme,
  renderClearScreen,
  renderCliBanner,
  renderCliCloseout,
  renderCliError,
  renderCliEvent,
  renderCliPrompt,
  renderCliSection,
  setCliUiTheme,
} from "./ui.js";
import { exportProtectedPromptDump, inspectPromptSource } from "../prompt/inspect.js";
import { CliTranscriptBrowserStore } from "./transcript.js";
import type { CliWorkflowMode } from "./workflow.js";
import { createClient, getStaticPromptSource } from "../config.js";
import { summarizeDeliveryReport } from "../delivery/types.js";
import {
  dropPendingApprovalReplay,
  popPendingApprovalReplay,
} from "../runtime/query-tool-approvals.js";
import { analyzeToolOutput, markWriteSideEffect } from "../runtime/query-tool-results.js";
import { parseToolArgs } from "../runtime/tool-runtime.js";
import type { AgentRuntimeState } from "../runtime/query-types.js";
import { runUserQuery } from "../runtime/query-runtime.js";
import { RUNTIME_CONFIG } from "../runtime-config.js";
import type { RuntimeCoordinationServiceLike } from "../services/index.js";
import { runCliShellShortcut } from "./shell.js";
import { getSkillCatalog, loadSkill } from "../skills/loader.js";
import { compactMessages, withCompactRuntimeContext } from "../tools/context-compact.js";
import {
  getMcpRegistryStatus,
  resetMcpRegistryAuthFailures,
} from "../tools/mcp.js";
import { addWorkspaceRoot } from "../workspace-roots.js";

type LineEditor = {
  line: string;
  write(input: string): void;
};

type ChunkWriter = {
  write(chunk: string): void;
};

type ScheduledRoundOptions = {
  isAgentBusy: () => boolean;
  setAgentBusy: (busy: boolean) => void;
  history: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
  client: OpenAI;
  model: string;
  promptSource: AgentAppRuntimeDeps["promptSource"];
  printAsyncEvent: (label: string, content: string) => void;
  runtimeCoordinationService?: RuntimeCoordinationServiceLike;
  queryEngine?: AgentAppRuntimeDeps["queryEngine"];
};

type RunCliOverrides = Partial<AgentAppRuntimeDeps>;

export type RunCliOptions = RunCliOverrides & {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  service?: InteractiveCliServiceLike;
  resolveDaemonService?: () => Promise<DaemonCliServiceResolution | null>;
};

type CliSessionRecord = AgentSessionRecord & {
  changedPaths: Set<string>;
};

function createCliSession(): CliSessionRecord {
  const record = createAgentSessionRecord();
  return { ...record, changedPaths: new Set<string>() };
}

function createShellAppRuntime(overrides: RunCliOverrides): {
  app: AgentAppRuntimeDeps;
  startupIssue: Error | null;
} {
  try {
    return { app: createAgentAppRuntime(overrides), startupIssue: null };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Missing environment variable: MODEL_ID")
    ) {
      return {
        app: createAgentAppRuntime({
          ...overrides,
          client: overrides.client ?? ({} as OpenAI),
          model: overrides.model ?? "unset-model",
          promptSource: overrides.promptSource ?? getStaticPromptSource(),
        }),
        startupIssue: error,
      };
    }
    throw error;
  }
}

function toCliSessionSummary(
  session: {
    id: string;
    busy: boolean;
    history: ChatCompletionMessageParam[];
    messageCount?: number;
  },
  activeSessionId: string | null,
): { id: string; messageCount: number; busy: boolean; active: boolean } {
  return {
    id: session.id,
    messageCount: session.messageCount ?? session.history.length,
    busy: session.busy,
    active: session.id === activeSessionId,
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function parseToolJson(raw: string): {
  ok: boolean;
  data: Record<string, unknown>;
  message: string;
} {
  try {
    const parsed = JSON.parse(raw) as { ok?: boolean; error?: { message?: unknown } };
    return {
      ok: parsed.ok !== false,
      data: parsed as Record<string, unknown>,
      message: String(parsed.error?.message ?? ""),
    };
  } catch {
    return { ok: false, data: {}, message: raw.trim() || "invalid tool response" };
  }
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
  if (bufferedInput && opts.lineEditor) {
    opts.lineEditor.write(bufferedInput);
  }
}

export async function runScheduledRound(opts: ScheduledRoundOptions): Promise<boolean> {
  const runtimeCoordinationService = opts.runtimeCoordinationService;
  const queryEngine = opts.queryEngine;

  try {
    if (opts.isAgentBusy()) {
      return false;
    }
    if (!runtimeCoordinationService) {
      throw new Error("scheduled round requires runtimeCoordinationService");
    }
    await runtimeCoordinationService.tickScheduler();
    const dueCount = await runtimeCoordinationService.peekScheduledPromptCount();
    if (dueCount === 0) {
      return false;
    }

    opts.setAgentBusy(true);
    opts.printAsyncEvent(
      "scheduled due",
      `${dueCount} scheduled prompt${dueCount === 1 ? "" : "s"} due now.`,
    );
    try {
      opts.history.push({
        role: "user",
        content: "Handle any scheduled prompts that are due now.",
      });
      if (!queryEngine) {
        throw new Error("scheduled round requires queryEngine");
      }
      await withCompactRuntimeContext({ messages: opts.history }, async () =>
        queryEngine.run({
          messages: opts.history,
          runtimeState: opts.runtimeState,
          includeScheduledNotifications: true,
        }),
      );
      const lastMessage = opts.history[opts.history.length - 1];
      if (
        lastMessage?.role === "assistant" &&
        typeof lastMessage.content === "string" &&
        lastMessage.content.trim()
      ) {
        opts.printAsyncEvent("scheduled", lastMessage.content);
      } else {
        opts.printAsyncEvent(
          "scheduled",
          "Scheduled prompt processed without a text reply. Check tool output and side effects above.",
        );
      }
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

async function runDaemonCli(opts: {
  service: InteractiveCliServiceLike;
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  attachNotice: string | null;
}): Promise<void> {
  const composer = new CliComposerStore();
  const paletteStore = new CliPaletteStore();
  const transcriptBrowser = new CliTranscriptBrowserStore();
  const changedPathsBySessionId = new Map<string, Set<string>>();
  let activeSessionId = opts.service.listSessions().at(-1)?.id ?? null;
  let workflow: CliWorkflowMode = "agent";
  const currentModel = "daemon-host";
  const toolRunner = getInteractiveCliToolRunner(opts.service);

  const getSessionSummaries = () =>
    opts.service.listSessions().map((session) => toCliSessionSummary(session, activeSessionId));
  const getSessionHistory = (
    sessionId: string | null = activeSessionId,
  ): ChatCompletionMessageParam[] => {
    if (!sessionId) {
      return [];
    }
    return opts.service.listSessions().find((session) => session.id === sessionId)?.history ?? [];
  };
  const getActiveSessionChangedPaths = (): string[] => [
    ...(changedPathsBySessionId.get(activeSessionId ?? "__shell__") ?? new Set<string>()),
  ];
  const getComposeSessionId = (): string => activeSessionId ?? "__shell__";
  const ensureActiveSession = async (): Promise<string> => {
    if (activeSessionId) {
      const exists = opts.service.listSessions().some((session) => session.id === activeSessionId);
      if (exists) {
        return activeSessionId;
      }
    }
    const created = await opts.service.createSession();
    activeSessionId = created.id;
    return created.id;
  };
  const renderBanner = () =>
    renderCliBanner({
      title: "Agent CLI",
      workspace: path.basename(process.cwd()),
      mode: `interactive/${workflow}/daemon`,
      model: currentModel,
      sessionId: activeSessionId,
      commands: ["/help", "/workflow", "/palette", "/history", "/next", "/compose", "/status"],
    });
  const getComposerSnapshot = (sessionId: string | null) => ({
    active: composer.isActive(sessionId),
    lineCount: composer.lineCount(sessionId),
    charCount: composer.preview(sessionId)?.charCount ?? 0,
  });
  const rl = createInterface({
    input: opts.input,
    output: opts.output,
    completer: (line: string) =>
      completeCliLine(line, {
        sessions: getSessionSummaries(),
        helpTopics: listCliHelpTopics(),
        transcriptEntryCount: getSessionHistory(activeSessionId).length,
        paletteEntryCount: paletteStore.lastCount(activeSessionId),
        model: currentModel,
      }),
  });

  opts.output.write(`${renderBanner()}\n`);
  if (opts.attachNotice) {
    opts.output.write(`${opts.attachNotice}\n\n`);
  }

  try {
    while (true) {
      let query = "";
      try {
        query = await rl.question(
          renderCliPrompt(activeSessionId, getComposerSnapshot(getComposeSessionId()), workflow),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ERR_USE_AFTER_CLOSE") {
          break;
        }
        throw error;
      }

      const normalized = query.trim().toLowerCase();
      if (!query.trim() && !composer.isActive(getComposeSessionId())) {
        continue;
      }
      if (
        !composer.isActive(getComposeSessionId()) &&
        (normalized === "q" || normalized === "exit")
      ) {
        opts.output.write(
          `${renderCliCloseout({
            sessionId: activeSessionId,
            changedPaths: getActiveSessionChangedPaths(),
          })}\n`,
        );
        break;
      }

      const command = await dispatchCliCommand(query, {
        activeSessionId,
        createSession: async () => {
          const session = await opts.service.createSession();
          activeSessionId = session.id;
          return { id: session.id };
        },
        listSessions: getSessionSummaries,
        useSession: (sessionId) => {
          if (!opts.service.listSessions().some((session) => session.id === sessionId)) {
            return false;
          }
          activeSessionId = sessionId;
          return true;
        },
        listTools: async () => opts.service.toolsMetadata(),
        getStatus: async () =>
          collectCliStatusSnapshot({
            mode: `interactive/${workflow}/daemon`,
            activeSessionId,
            sessionCount: getSessionSummaries().length,
            bridgeEndpoint: getInteractiveCliBridgeEndpoint(opts.service),
            toolMetadata: await opts.service.toolsMetadata(),
            model: currentModel,
          }),
        getConfig: () => collectCliConfigSnapshot({ model: process.env.MODEL_ID?.trim() }),
        getMcpStatus: getMcpRegistryStatus,
        resetMcpAuthFailures: resetMcpRegistryAuthFailures,
        getPermissions: collectCliPermissionSnapshot,
        setPermissionMode: (mode) => {
          setCliPermissionMode(mode);
          return true;
        },
        listApprovals: async (status) => {
          if (!toolRunner) {
            return JSON.stringify(
              {
                ok: false,
                error: { message: "daemon tool surface is unavailable" },
              },
              null,
              2,
            );
          }
          return toolRunner("security_list_approvals", JSON.stringify(status ? { status } : {}));
        },
        approveRequest: async (requestId) => {
          if (!toolRunner) {
            return JSON.stringify(
              {
                ok: false,
                error: { message: "daemon tool surface is unavailable" },
              },
              null,
              2,
            );
          }
          return toolRunner("security_approve", JSON.stringify({ request_id: requestId }));
        },
        rejectRequest: async (requestId) => {
          if (!toolRunner) {
            return JSON.stringify(
              {
                ok: false,
                error: { message: "daemon tool surface is unavailable" },
              },
              null,
              2,
            );
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
            allowedTools: skill.allowedTools,
            model: skill.model,
            pathPatterns: skill.pathPatterns,
            sourceType: skill.sourceType,
            containsShellCommands: skill.containsShellCommands,
            canRunShell: skill.canRunShell,
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
        getUsage: () => collectCliUsageSnapshot(currentModel),
        compactSession: async () => ({
          keptRecent: 0,
          oldMessageCount: 0,
          newMessageCount: 0,
          estimatedBefore: 0,
          estimatedAfter: 0,
          reducedBy: 0,
          transcriptBeforePath: "",
          transcriptAfterPath: "",
        }),
        isComposing: () => composer.isActive(getComposeSessionId()),
        getComposeLineCount: () => composer.lineCount(getComposeSessionId()),
        getComposeCharCount: () => composer.preview(getComposeSessionId())?.charCount ?? 0,
        startCompose: () => composer.start(getComposeSessionId()),
        appendComposeLine: (line) => composer.append(getComposeSessionId(), line),
        previewCompose: () => composer.preview(getComposeSessionId()),
        popCompose: (count) => composer.pop(getComposeSessionId(), count),
        sendCompose: () => composer.consume(getComposeSessionId()),
        cancelCompose: () => composer.cancel(getComposeSessionId()),
        getModel: () => currentModel,
        setModel: async () => false,
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
          return true;
        },
        showPalette: async (query = "") =>
          paletteStore.search(
            activeSessionId,
            {
              sessions: getSessionSummaries(),
              helpTopics: listCliHelpTopics(),
              composerActive: composer.isActive(getComposeSessionId()),
              pendingApprovals: (await collectCliPermissionSnapshot()).pendingApprovals,
              workflow,
            },
            query,
          ),
        openPalette: (index) => paletteStore.open(activeSessionId, index),
        showTranscript: (direction = "current") =>
          transcriptBrowser.history(activeSessionId, getSessionHistory(activeSessionId), direction),
        searchTranscript: (query) =>
          transcriptBrowser.search(activeSessionId, getSessionHistory(activeSessionId), query),
        moveTranscriptSearch: (direction) =>
          transcriptBrowser.moveSearch(
            activeSessionId,
            getSessionHistory(activeSessionId),
            direction,
          ),
        peekTranscript: (entryIndex) =>
          transcriptBrowser.peek(activeSessionId, getSessionHistory(activeSessionId), entryIndex),
        moveTranscriptPeek: (direction) =>
          transcriptBrowser.peekRelative(
            activeSessionId,
            getSessionHistory(activeSessionId),
            direction,
          ),
        tailTranscript: () =>
          transcriptBrowser.tail(activeSessionId, getSessionHistory(activeSessionId)),
        canCompactSession: () => false,
      });
      if (command.handled) {
        if (command.nextSessionId) {
          activeSessionId = command.nextSessionId;
        }
        if (command.clearScreen) {
          opts.output.write(renderClearScreen());
        }
        if (command.showBanner) {
          opts.output.write(`${renderBanner()}\n`);
        }
        if (command.output) {
          opts.output.write(`${command.output}\n\n`);
        }
        if (command.exit) {
          opts.output.write(
            `${renderCliCloseout({
              sessionId: activeSessionId,
              changedPaths: getActiveSessionChangedPaths(),
            })}\n`,
          );
          break;
        }
        if (!command.submitPrompt) {
          continue;
        }
        query = command.submitPrompt;
      }

      if (query.trim().startsWith("!")) {
        if (!toolRunner) {
          opts.output.write(
            `${renderCliError("shell unavailable", "daemon tool surface is unavailable")}\n\n`,
          );
          continue;
        }
        opts.output.write(`${await runCliShellShortcut(query.trim().slice(1), toolRunner)}\n\n`);
        continue;
      }

      const sessionId = await ensureActiveSession();
      const result = await opts.service.chat({
        session_id: sessionId,
        message: query,
      });
      if (result.ok === false) {
        opts.output.write(
          `${renderCliError("chat failed", String((result.error as { message?: string } | undefined)?.message ?? "chat failed"))}\n\n`,
        );
        continue;
      }
      const nextSessionId = String(
        (result.session as { id?: unknown } | undefined)?.id ?? sessionId,
      );
      activeSessionId = nextSessionId || sessionId;
      if (typeof result.assistant === "string" && result.assistant.trim()) {
        opts.output.write(`${renderCliSection("Assistant", result.assistant)}\n\n`);
      }
    }
  } finally {
    rl.close();
  }
}

export async function runCli(options: RunCliOptions = {}): Promise<void> {
  const {
    input: providedInput,
    output: providedOutput,
    service,
    resolveDaemonService,
    ...runtimeOverrides
  } = options;
  const input = providedInput ?? stdin;
  const output = providedOutput ?? stdout;
  let daemonService = service ?? null;
  let attachNotice: string | null = null;
  if (!daemonService) {
    try {
      const resolved = await (resolveDaemonService ?? (() => resolveDaemonCliService()))();
      daemonService = resolved?.service ?? null;
      attachNotice = resolved?.notice ?? null;
    } catch (error) {
      attachNotice = renderCliError(
        "daemon attach failed",
        error instanceof Error ? error.message : String(error),
        "falling back to embedded runtime",
      );
    }
  }
  if (daemonService) {
    await runDaemonCli({
      service: daemonService,
      input,
      output,
      attachNotice,
    });
    return;
  }

  let { app, startupIssue } = createShellAppRuntime(runtimeOverrides);
  const sessions = new Map<string, CliSessionRecord>();
  const composer = new CliComposerStore();
  const paletteStore = new CliPaletteStore();
  const transcriptBrowser = new CliTranscriptBrowserStore();
  const initialSession = createCliSession();
  sessions.set(initialSession.id, initialSession);
  let activeSessionId = initialSession.id;
  let agentBusy = false;
  let workflow: CliWorkflowMode = "agent";
  let waitingForInput = false;
  const rl = createInterface({
    input,
    output,
    completer: (line: string) =>
      completeCliLine(line, {
        sessions: [...sessions.values()].map((session) => ({
          id: session.id,
          messageCount: session.history.length,
          busy: session.busy,
          active: session.id === activeSessionId,
        })),
        helpTopics: listCliHelpTopics(),
        transcriptEntryCount: sessions.get(activeSessionId)?.history.length ?? 0,
        paletteEntryCount: paletteStore.lastCount(activeSessionId),
        model: app.model,
      }),
  });

  const rebuildApp = (model: string): boolean => {
    try {
      process.env.MODEL_ID = model;
      app = createAgentAppRuntime({
        ...runtimeOverrides,
        client: runtimeOverrides.client ?? createClient(),
        model,
        promptSource: runtimeOverrides.promptSource ?? getStaticPromptSource(),
      });
      startupIssue = null;
      return true;
    } catch {
      return false;
    }
  };

  const getActiveSession = (): CliSessionRecord => {
    const session = sessions.get(activeSessionId);
    if (!session) {
      throw new Error(`active session missing: ${activeSessionId}`);
    }
    return session;
  };
  const getComposerSnapshot = (sessionId: string | null) => ({
    active: composer.isActive(sessionId),
    lineCount: composer.lineCount(sessionId),
    charCount: composer.preview(sessionId)?.charCount ?? 0,
  });
  const renderBanner = () =>
    renderCliBanner({
      title: "Agent CLI",
      workspace: path.basename(process.cwd()),
      mode: `interactive/${workflow}`,
      model: app.model,
      sessionId: activeSessionId,
      commands: ["/help", "/workflow", "/palette", "/history", "/next", "/compose", "/status"],
    });
  const printAsyncEvent = (label: string, content: string) => {
    renderAsyncCliEvent({
      output,
      prompt: renderCliPrompt(activeSessionId, getComposerSnapshot(activeSessionId), workflow),
      label,
      content,
      waitingForInput,
      lineEditor: rl,
    });
  };

  output.write(`${renderBanner()}\n`);
  if (attachNotice) {
    output.write(`${attachNotice}\n\n`);
  }
  if (startupIssue) {
    output.write(
      `${renderCliError("startup", startupIssue.message, "run /doctor before sending model queries")}\n\n`,
    );
  }

  const schedulerInterval = setInterval(() => {
    if (startupIssue) {
      return;
    }
    const activeSession = getActiveSession();
    void runScheduledRound({
      isAgentBusy: () => agentBusy,
      setAgentBusy: (busy) => {
        agentBusy = busy;
      },
      history: activeSession.history,
      runtimeState: activeSession.runtimeState,
      client: app.client,
      model: app.model,
      promptSource: app.promptSource,
      printAsyncEvent,
      runtimeCoordinationService: app.runtimeCoordinationService,
      queryEngine: app.queryEngine,
    });
  }, RUNTIME_CONFIG.schedulerPollIntervalMs);

  try {
    while (true) {
      let query = "";
      try {
        waitingForInput = true;
        query = await rl.question(
          renderCliPrompt(activeSessionId, getComposerSnapshot(activeSessionId), workflow),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ERR_USE_AFTER_CLOSE") {
          break;
        }
        throw error;
      } finally {
        waitingForInput = false;
      }

      const normalized = query.trim().toLowerCase();
      if (!query.trim() && !composer.isActive(activeSessionId)) {
        continue;
      }
      if (!composer.isActive(activeSessionId) && (normalized === "q" || normalized === "exit")) {
        output.write(
          `${renderCliCloseout({
            sessionId: activeSessionId,
            changedPaths: [...getActiveSession().changedPaths],
          })}\n`,
        );
        break;
      }

      const command = await dispatchCliCommand(query, {
        activeSessionId,
        createSession: async () => {
          const session = createCliSession();
          sessions.set(session.id, session);
          activeSessionId = session.id;
          return { id: session.id };
        },
        listSessions: () =>
          [...sessions.values()].map((session) => ({
            id: session.id,
            messageCount: session.history.length,
            busy: session.busy,
            active: session.id === activeSessionId,
          })),
        useSession: (sessionId) => {
          if (!sessions.has(sessionId)) {
            return false;
          }
          activeSessionId = sessionId;
          return true;
        },
        listTools: async () => app.toolService.listToolMetadata(),
        getStatus: async () =>
          collectCliStatusSnapshot({
            mode: `interactive/${workflow}`,
            activeSessionId,
            sessionCount: sessions.size,
            bridgeEndpoint: "/events",
            app,
            model: app.model,
          }),
        getConfig: () => collectCliConfigSnapshot({ model: app.model }),
        getMcpStatus: getMcpRegistryStatus,
        resetMcpAuthFailures: resetMcpRegistryAuthFailures,
        getPermissions: collectCliPermissionSnapshot,
        setPermissionMode: (mode) => {
          setCliPermissionMode(mode);
          return true;
        },
        listApprovals: async (status) =>
          app.toolService.runToolByName(
            "security_list_approvals",
            JSON.stringify(status ? { status } : {}),
          ),
        approveRequest: async (requestId) => {
          const approvalRaw = await app.toolService.runToolByName(
            "security_approve",
            JSON.stringify({ request_id: requestId }),
          );
          const approval = parseToolJson(approvalRaw);
          if (!approval.ok) {
            return approvalRaw;
          }
          getActiveSession().runtimeState.pendingApprovalCandidate = null;
          const replay = popPendingApprovalReplay(getActiveSession().runtimeState, requestId);
          if (!replay) {
            return approvalRaw;
          }
          const replayRaw = await app.toolService.runToolByName(
            replay.toolName,
            replay.argumentsJson,
          );
          const replayAnalysis = analyzeToolOutput(replayRaw);
          if (replayAnalysis.ok) {
            const replayArgs = parseToolArgs(replay.argumentsJson);
            markWriteSideEffect(getActiveSession().runtimeState, replay.toolName, replayArgs);
            if (replay.toolName === "write_file" || replay.toolName === "edit_file") {
              const changedPath = typeof replayArgs.path === "string" ? replayArgs.path.trim() : "";
              if (changedPath) {
                getActiveSession().changedPaths.add(changedPath);
              }
            }
          }
          return JSON.stringify(
            {
              ...approval.data,
              replay: {
                ok: replayAnalysis.ok,
                preview: replay.preview,
                summary: replayAnalysis.summary,
              },
            },
            null,
            2,
          );
        },
        rejectRequest: async (requestId) => {
          dropPendingApprovalReplay(getActiveSession().runtimeState, requestId);
          getActiveSession().runtimeState.pendingApprovalCandidate = null;
          return app.toolService.runToolByName(
            "security_reject",
            JSON.stringify({ request_id: requestId }),
          );
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
            allowedTools: skill.allowedTools,
            model: skill.model,
            pathPatterns: skill.pathPatterns,
            sourceType: skill.sourceType,
            containsShellCommands: skill.containsShellCommands,
            canRunShell: skill.canRunShell,
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
                ? await exportProtectedPromptDump(app.promptSource)
                : inspectPromptSource(app.promptSource, mode),
            loadedNames: catalog.loadedNames,
            missingNames: catalog.missingNames,
          };
        },
        getUsage: () => collectCliUsageSnapshot(app.model),
        canCompactSession: () => true,
        compactSession: async (keepRecent) =>
          compactMessages({ messages: getActiveSession().history }, "manual", keepRecent),
        isComposing: () => composer.isActive(activeSessionId),
        getComposeLineCount: () => composer.lineCount(activeSessionId),
        getComposeCharCount: () => composer.preview(activeSessionId)?.charCount ?? 0,
        startCompose: () => composer.start(activeSessionId),
        appendComposeLine: (line) => composer.append(activeSessionId, line),
        previewCompose: () => composer.preview(activeSessionId),
        popCompose: (count) => composer.pop(activeSessionId, count),
        sendCompose: () => composer.consume(activeSessionId),
        cancelCompose: () => composer.cancel(activeSessionId),
        getModel: () => app.model,
        setModel: async (model) => rebuildApp(model),
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
          return true;
        },
        showPalette: async (query = "") =>
          paletteStore.search(
            activeSessionId,
            {
              sessions: [...sessions.values()].map((session) => ({
                id: session.id,
                messageCount: session.history.length,
                busy: session.busy,
                active: session.id === activeSessionId,
              })),
              helpTopics: listCliHelpTopics(),
              composerActive: composer.isActive(activeSessionId),
              pendingApprovals: (await collectCliPermissionSnapshot()).pendingApprovals,
              workflow,
            },
            query,
          ),
        openPalette: (index) => paletteStore.open(activeSessionId, index),
        showTranscript: (direction = "current") =>
          transcriptBrowser.history(activeSessionId, getActiveSession().history, direction),
        searchTranscript: (query) =>
          transcriptBrowser.search(activeSessionId, getActiveSession().history, query),
        moveTranscriptSearch: (direction) =>
          transcriptBrowser.moveSearch(activeSessionId, getActiveSession().history, direction),
        peekTranscript: (entryIndex) =>
          transcriptBrowser.peek(activeSessionId, getActiveSession().history, entryIndex),
        moveTranscriptPeek: (direction) =>
          transcriptBrowser.peekRelative(activeSessionId, getActiveSession().history, direction),
        tailTranscript: () => transcriptBrowser.tail(activeSessionId, getActiveSession().history),
      });
      if (command.handled) {
        if (command.nextSessionId) {
          activeSessionId = command.nextSessionId;
        }
        if (command.clearScreen) {
          output.write(renderClearScreen());
        }
        if (command.showBanner) {
          output.write(`${renderBanner()}\n`);
        }
        if (command.output) {
          output.write(`${command.output}\n\n`);
        }
        if (command.exit) {
          output.write(
            `${renderCliCloseout({
              sessionId: activeSessionId,
              changedPaths: [...getActiveSession().changedPaths],
            })}\n`,
          );
          break;
        }
        if (!command.submitPrompt) {
          continue;
        }
        query = command.submitPrompt;
      }

      if (query.trim().startsWith("!")) {
        output.write(
          `${await runCliShellShortcut(query.trim().slice(1), app.toolService.runToolByName.bind(app.toolService))}\n\n`,
        );
        continue;
      }

      if (startupIssue) {
        output.write(
          `${renderCliError("model not ready", startupIssue.message, "set MODEL_ID and rerun /doctor")}\n\n`,
        );
        continue;
      }

      const activeSession = getActiveSession();
      agentBusy = true;
      activeSession.busy = true;
      try {
        const result = await runUserQuery({
          app,
          history: activeSession.history,
          runtimeState: activeSession.runtimeState,
          prompt: query,
        });
        if (!result.ok) {
          output.write(
            `${renderCliError("hook blocked", result.error.message, "adjust your prompt or local hook policy")}\n\n`,
          );
          continue;
        }
        if (result.assistant) {
          output.write(`${renderCliSection("Assistant", result.assistant)}\n\n`);
        }
        if (activeSession.runtimeState.wroteWorkspaceFiles) {
          for (const changedPath of activeSession.runtimeState.touchedPaths) {
            activeSession.changedPaths.add(changedPath);
          }
          const report = await app.deliveryService.loadLatestReport().catch(() => null);
          output.write(
            `${renderCliCloseout({
              sessionId: activeSessionId,
              changedPaths: [...activeSession.runtimeState.touchedPaths],
              validationSummary: report ? summarizeDeliveryReport(report) : null,
              risks: report?.risks ?? [],
              suggestions: report?.suggestions ?? [],
            })}\n\n`,
          );
        }
      } finally {
        agentBusy = false;
        activeSession.busy = false;
      }
    }
  } finally {
    clearInterval(schedulerInterval);
    rl.close();
  }
}
