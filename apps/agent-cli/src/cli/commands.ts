import {
  listCliHelpTopics,
  renderCliApprovals,
  renderCliArchitecture,
  renderCliCompactSummary,
  renderCliComposer,
  renderCliConfig,
  renderCliDoctor,
  renderCliError,
  renderCliHelp,
  renderCliPalette,
  renderCliPermissions,
  renderCliPromptDump,
  renderCliSessions,
  renderCliSkillDetail,
  renderCliSkills,
  renderCliStatus,
  renderCliTranscript,
  renderCliTools,
  renderCliUsage,
  resolveCliHelpTopic,
  type CliHelpTopicId,
  type CliCompactSummary,
  type CliConfigSnapshot,
  type CliPermissionSnapshot,
  type CliSessionSummary,
  type CliSkillDetail,
  type CliSkillSummary,
  type CliStatusSnapshot,
  type CliThemeName,
  type CliUsageSnapshot,
} from "./ui.js";
import type { CliDoctorReport } from "./ui.js";
import type { CliPaletteCandidate, CliPaletteView } from "./palette.js";
import type { CliPermissionMode } from "./permissions.js";
import type { PromptDump } from "../prompt/inspect.js";
import type { CliTranscriptView } from "./transcript.js";
import type { CliWorkflowMode } from "./workflow.js";

export type CliCommandResult =
  | { handled: false }
  | {
      handled: true;
      output: string;
      clearScreen?: boolean;
      exit?: boolean;
      showBanner?: boolean;
      nextSessionId?: string | null;
      submitPrompt?: string;
    };

export type CliCommandContext = {
  activeSessionId: string | null;
  createSession(): { id: string };
  listSessions(): CliSessionSummary[];
  useSession(sessionId: string): boolean;
  listTools(): Promise<Array<Record<string, string>>>;
  getStatus(): Promise<CliStatusSnapshot>;
  getConfig(): Promise<CliConfigSnapshot>;
  getPermissions(): Promise<CliPermissionSnapshot>;
  setPermissionMode(mode: CliPermissionMode): boolean;
  listApprovals(status?: "pending" | "approved" | "rejected" | "expired" | "consumed"): Promise<string>;
  approveRequest(requestId: string): Promise<string>;
  rejectRequest(requestId: string): Promise<string>;
  listSkills(): Promise<{ skills: CliSkillSummary[]; loadedNames: string[]; missingNames: string[] }>;
  getSkill(name: string): Promise<CliSkillDetail | null>;
  dumpSystemPrompt(): Promise<{ dump: PromptDump; loadedNames: string[]; missingNames: string[] }>;
  getUsage(): Promise<CliUsageSnapshot>;
  compactSession(keepRecent?: number): Promise<CliCompactSummary>;
  isComposing(): boolean;
  getComposeLineCount(): number;
  getComposeCharCount(): number;
  startCompose(): { lineCount: number; charCount: number };
  appendComposeLine(line: string): { lineCount: number; charCount: number };
  previewCompose(): { lineCount: number; charCount: number; content: string } | null;
  popCompose(count: number): { removedLineCount: number; lineCount: number; charCount: number; content: string } | null;
  sendCompose(): { lineCount: number; charCount: number; content: string } | null;
  cancelCompose(): { lineCount: number; charCount: number; content: string } | null;
  getModel(): string;
  setModel(model: string): Promise<boolean>;
  addWorkspaceRoot(root: string): Promise<{ ok: true; root: string } | { ok: false; error: string }>;
  runDoctor(): Promise<CliDoctorReport>;
  getTheme(): CliThemeName;
  setTheme(theme: CliThemeName): boolean;
  getWorkflow(): CliWorkflowMode;
  setWorkflow(mode: CliWorkflowMode): boolean;
  showPalette(query?: string): Promise<CliPaletteView>;
  openPalette(index: number): CliPaletteCandidate | null;
  showTranscript(direction?: "current" | "next" | "prev" | "first" | "last"): CliTranscriptView;
  searchTranscript(query: string): CliTranscriptView;
  moveTranscriptSearch(direction: "next" | "prev"): CliTranscriptView | null;
  peekTranscript(entryIndex: number): CliTranscriptView | null;
  moveTranscriptPeek(direction: "next" | "prev"): CliTranscriptView | null;
  tailTranscript(): CliTranscriptView;
};

function parseArgs(input: string): { command: string; args: string[] } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const [command, ...args] = trimmed.slice(1).split(/\s+/).filter(Boolean);
  return { command: (command ?? "").toLowerCase(), args };
}

type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "consumed";

type ApprovalRecord = {
  request_id?: unknown;
  action?: unknown;
  risk?: unknown;
  reason?: unknown;
  status?: unknown;
};

type ReplayRecord = {
  ok?: unknown;
  preview?: unknown;
  summary?: unknown;
};

type SessionResolution =
  | { ok: true; session: CliSessionSummary; index: number; total: number }
  | { ok: false; output: string };

function parseToolResult(raw: string): { ok: boolean; data: Record<string, unknown>; message: string } {
  try {
    const parsed = JSON.parse(raw) as {
      ok?: boolean;
      error?: { message?: unknown };
      [key: string]: unknown;
    };
    return {
      ok: parsed.ok !== false,
      data: parsed as Record<string, unknown>,
      message: String(parsed.error?.message ?? ""),
    };
  } catch {
    return { ok: false, data: {}, message: raw.trim() || "invalid tool response" };
  }
}

function isApprovalStatus(value: string | undefined): value is ApprovalStatus {
  return (
    value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "expired" ||
    value === "consumed"
  );
}

function formatApprovalDecision(raw: string, verb: "approved" | "rejected"): string {
  const result = parseToolResult(raw);
  if (!result.ok) {
    return renderCliError(`${verb} failed`, result.message || `unable to mark approval as ${verb}`);
  }
  const request = (result.data.request ?? {}) as ApprovalRecord;
  const requestId = String(request.request_id ?? "");
  const action = String(request.action ?? "");
  const status = String(request.status ?? verb);
  const risk = String(request.risk ?? "");
  const replay = (result.data.replay ?? null) as ReplayRecord | null;
  const lines = [`${status} ${requestId}${action ? ` for ${action}` : ""}${risk ? ` (${risk})` : ""}`];
  if (replay) {
    const preview = String(replay.preview ?? "").trim();
    const summary = String(replay.summary ?? "").trim();
    lines.push(
      replay.ok === false
        ? `replay failed${preview ? `: ${preview}` : ""}${summary ? ` | ${summary}` : ""}`
        : `replayed${preview ? `: ${preview}` : ""}${summary ? ` | ${summary}` : ""}`,
    );
  }
  return lines.join("\n");
}

function parseApprovalRecords(raw: string): { ok: boolean; approvals: ApprovalRecord[]; message: string } {
  const result = parseToolResult(raw);
  return {
    ok: result.ok,
    approvals: Array.isArray(result.data.approvals) ? (result.data.approvals as ApprovalRecord[]) : [],
    message: result.message,
  };
}

async function resolveApprovalShortcutRequestId(
  context: CliCommandContext,
): Promise<{ ok: true; requestId: string } | { ok: false; output: string }> {
  const listed = parseApprovalRecords(await context.listApprovals("pending"));
  if (!listed.ok) {
    return {
      ok: false,
      output: renderCliError("approvals failed", listed.message || "unable to inspect pending approvals"),
    };
  }
  if (listed.approvals.length === 0) {
    return {
      ok: false,
      output: renderCliError("no pending approvals", "there is no pending approval to act on"),
    };
  }
  if (listed.approvals.length > 1) {
    return {
      ok: false,
      output: renderCliError(
        "multiple pending approvals",
        `found ${listed.approvals.length} pending approvals`,
        "use /approvals and then /approve <request_id> or /reject <request_id>",
      ),
    };
  }
  return {
    ok: true,
    requestId: String(listed.approvals[0]?.request_id ?? ""),
  };
}

async function maybeHandleApprovalShortcut(
  input: string,
  context: CliCommandContext,
): Promise<CliCommandResult | null> {
  if (context.isComposing()) {
    return null;
  }
  const normalized = input.trim().toLowerCase();
  const isApprove =
    normalized === "批准" || normalized === "同意" || normalized === "approve" || normalized === "yes";
  const isReject =
    normalized === "拒绝" || normalized === "不同意" || normalized === "reject" || normalized === "no";
  if (!isApprove && !isReject) {
    return null;
  }
  const resolved = await resolveApprovalShortcutRequestId(context);
  if (!resolved.ok) {
    return { handled: true, output: resolved.output };
  }
  return {
    handled: true,
    output: formatApprovalDecision(
      await (isApprove ? context.approveRequest(resolved.requestId) : context.rejectRequest(resolved.requestId)),
      isApprove ? "approved" : "rejected",
    ),
  };
}

function resolveSessionSelector(
  sessions: CliSessionSummary[],
  selectorRaw: string,
): SessionResolution {
  if (sessions.length === 0) {
    return {
      ok: false,
      output: renderCliError("no sessions", "there are no sessions available yet", "run /clear or /new to create one"),
    };
  }
  const selector = selectorRaw.trim();
  if (!selector) {
    return {
      ok: false,
      output: renderCliError("missing session selector", "use /use <id|prefix|index|latest>"),
    };
  }
  const normalized = selector.toLowerCase();
  if (normalized === "latest") {
    const session = sessions.at(-1);
    if (!session) {
      return {
        ok: false,
        output: renderCliError("no sessions", "there are no sessions available yet"),
      };
    }
    return { ok: true, session, index: sessions.length - 1, total: sessions.length };
  }
  if (/^\d+$/.test(selector)) {
    const index = Number(selector) - 1;
    if (index < 0 || index >= sessions.length) {
      return {
        ok: false,
        output: renderCliError(
          "session index out of range",
          `unsupported session index: ${selector}`,
          `use a value between 1 and ${sessions.length}`,
        ),
      };
    }
    return { ok: true, session: sessions[index] as CliSessionSummary, index, total: sessions.length };
  }
  const exactIndex = sessions.findIndex((session) => session.id === selector);
  if (exactIndex >= 0) {
    return {
      ok: true,
      session: sessions[exactIndex] as CliSessionSummary,
      index: exactIndex,
      total: sessions.length,
    };
  }
  const prefixMatches = sessions
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => session.id.startsWith(selector));
  if (prefixMatches.length === 1) {
    const match = prefixMatches[0] as { session: CliSessionSummary; index: number };
    return {
      ok: true,
      session: match.session,
      index: match.index,
      total: sessions.length,
    };
  }
  if (prefixMatches.length > 1) {
    return {
      ok: false,
      output: renderCliError(
        "ambiguous session selector",
        `selector '${selector}' matches ${prefixMatches.length} sessions`,
        "run /sessions and use a longer prefix, exact id, or numeric index",
      ),
    };
  }
  return {
    ok: false,
    output: renderCliError(
      "session not found",
      `unknown session selector: ${selector}`,
      "run /sessions to inspect available sessions",
    ),
  };
}

function cycleSession(
  sessions: CliSessionSummary[],
  activeSessionId: string | null,
  direction: "next" | "prev",
): SessionResolution {
  if (sessions.length === 0) {
    return {
      ok: false,
      output: renderCliError("no sessions", "there are no sessions available yet", "run /clear or /new to create one"),
    };
  }
  const currentIndex = Math.max(
    0,
    sessions.findIndex((session) => session.active || session.id === activeSessionId),
  );
  const delta = direction === "next" ? 1 : -1;
  const nextIndex = (currentIndex + delta + sessions.length) % sessions.length;
  return {
    ok: true,
    session: sessions[nextIndex] as CliSessionSummary,
    index: nextIndex,
    total: sessions.length,
  };
}

export async function dispatchCliCommand(
  input: string,
  context: CliCommandContext,
): Promise<CliCommandResult> {
  const approvalShortcut = await maybeHandleApprovalShortcut(input, context);
  if (approvalShortcut) {
    return approvalShortcut;
  }
  if (context.isComposing() && !input.trim().startsWith("/")) {
    const appended = context.appendComposeLine(input);
    return {
      handled: true,
      output: `draft updated: ${appended.lineCount} line(s) / ${appended.charCount} chars`,
    };
  }
  const parsed = parseArgs(input);
  if (!parsed) {
    return { handled: false };
  }

  if (parsed.command === "help") {
    const requestedTopic = parsed.args.join(" ");
    const topic = resolveCliHelpTopic(requestedTopic) as CliHelpTopicId | null;
    if (!topic) {
      return {
        handled: true,
        output: renderCliError(
          "unknown help topic",
          `unsupported help topic: ${requestedTopic.trim()}`,
          `use one of: ${listCliHelpTopics().join(", ")}`,
        ),
      };
    }
    return { handled: true, output: renderCliHelp(topic) };
  }
  if (parsed.command === "compose") {
    const draft = context.startCompose();
    return {
      handled: true,
      output:
        draft.lineCount > 0
          ? `composer resumed: ${draft.lineCount} line(s) / ${draft.charCount} chars`
          : "composer started: enter lines, then /send, /preview, or /cancel",
    };
  }
  if (parsed.command === "preview") {
    const draft = context.previewCompose();
    if (!draft) {
      return {
        handled: true,
        output: renderCliError("no draft", "start with /compose before previewing"),
      };
    }
    return {
      handled: true,
      output: renderCliComposer(draft),
    };
  }
  if (parsed.command === "pop") {
    const count = parsed.args[0] ? Number(parsed.args[0]) : 1;
    if (parsed.args[0] && (!Number.isInteger(count) || count <= 0)) {
      return {
        handled: true,
        output: renderCliError("invalid pop count", `unsupported value: ${parsed.args[0]}`, "use /pop or /pop 3"),
      };
    }
    const draft = context.popCompose(count);
    if (!draft) {
      return {
        handled: true,
        output: renderCliError("no draft", "start with /compose before removing draft lines"),
      };
    }
    if (draft.removedLineCount === 0) {
      return {
        handled: true,
        output: `draft unchanged: 0 line(s) removed, ${draft.lineCount} line(s) / ${draft.charCount} chars remain`,
      };
    }
    return {
      handled: true,
      output:
        `draft rewound: removed ${draft.removedLineCount} line(s), ` +
        `${draft.lineCount} line(s) / ${draft.charCount} chars remain`,
    };
  }
  if (parsed.command === "send") {
    const draft = context.sendCompose();
    if (!draft || !draft.content.trim()) {
      return {
        handled: true,
        output: renderCliError("no draft", "start with /compose and add at least one line before /send"),
      };
    }
    return {
      handled: true,
      output: `submitting draft: ${draft.lineCount} line(s) / ${draft.charCount} chars`,
      submitPrompt: draft.content,
    };
  }
  if (parsed.command === "cancel") {
    const draft = context.cancelCompose();
    if (!draft) {
      return {
        handled: true,
        output: renderCliError("no draft", "there is no active draft to cancel"),
      };
    }
    return {
      handled: true,
      output: `draft discarded: ${draft.lineCount} line(s) / ${draft.charCount} chars`,
    };
  }
  if (parsed.command === "status") {
    return { handled: true, output: renderCliStatus(await context.getStatus()) };
  }
  if (parsed.command === "config") {
    return { handled: true, output: renderCliConfig(await context.getConfig()) };
  }
  if (parsed.command === "architecture") {
    return { handled: true, output: renderCliArchitecture() };
  }
  if (parsed.command === "model") {
    const nextModel = parsed.args.join(" ").trim();
    if (!nextModel) {
      return { handled: true, output: `model: ${context.getModel()}` };
    }
    const changed = await context.setModel(nextModel);
    if (!changed) {
      return {
        handled: true,
        output: renderCliError("model update failed", `unable to switch to model: ${nextModel}`),
      };
    }
    return {
      handled: true,
      output: `model set to ${nextModel}`,
      showBanner: true,
    };
  }
  if (parsed.command === "permissions") {
    const nextMode = parsed.args[0]?.trim().toLowerCase();
    if (!nextMode) {
      return { handled: true, output: renderCliPermissions(await context.getPermissions()) };
    }
    if (nextMode !== "default" && nextMode !== "accept-edits" && nextMode !== "plan") {
      return {
        handled: true,
        output: renderCliError(
          "unknown permission mode",
          `unsupported permission mode: ${nextMode}`,
          "use /permissions default | accept-edits | plan",
        ),
      };
    }
    context.setPermissionMode(nextMode);
    return {
      handled: true,
      output: renderCliPermissions(await context.getPermissions()),
      showBanner: true,
    };
  }
  if (parsed.command === "approvals") {
    const status = parsed.args[0]?.trim().toLowerCase();
    if (parsed.args[0] && !isApprovalStatus(status)) {
      return {
        handled: true,
        output: renderCliError(
          "unknown approval status",
          `unsupported approval status: ${parsed.args[0]}`,
          "use /approvals or /approvals pending|approved|rejected|expired|consumed",
        ),
      };
    }
    const approvalStatus = isApprovalStatus(status) ? status : undefined;
    const listed = parseApprovalRecords(await context.listApprovals(approvalStatus));
    if (!listed.ok) {
      return {
        handled: true,
        output: renderCliError("approvals failed", listed.message || "unable to list approvals"),
      };
    }
    return {
      handled: true,
      output: renderCliApprovals(
        listed.approvals.map((item) => ({
          requestId: String(item.request_id ?? ""),
          action: String(item.action ?? ""),
          risk: String(item.risk ?? ""),
          status: String(item.status ?? ""),
          reason: String(item.reason ?? ""),
        })),
      ),
    };
  }
  if (parsed.command === "approve") {
    const requestId = parsed.args[0]?.trim() ?? "";
    if (!requestId) {
      return {
        handled: true,
        output: renderCliError("missing request id", "use /approve <request_id>"),
      };
    }
    return {
      handled: true,
      output: formatApprovalDecision(await context.approveRequest(requestId), "approved"),
    };
  }
  if (parsed.command === "reject") {
    const requestId = parsed.args[0]?.trim() ?? "";
    if (!requestId) {
      return {
        handled: true,
        output: renderCliError("missing request id", "use /reject <request_id>"),
      };
    }
    return {
      handled: true,
      output: formatApprovalDecision(await context.rejectRequest(requestId), "rejected"),
    };
  }
  if (parsed.command === "cost" || parsed.command === "usage") {
    return { handled: true, output: renderCliUsage(await context.getUsage()) };
  }
  if (parsed.command === "compact") {
    const keepRecent = parsed.args[0] ? Number(parsed.args[0]) : undefined;
    if (parsed.args[0] && (!Number.isInteger(keepRecent) || Number(keepRecent) <= 0)) {
      return {
        handled: true,
        output: renderCliError("invalid keep_recent", `unsupported value: ${parsed.args[0]}`, "use /compact or /compact 20"),
      };
    }
    return {
      handled: true,
      output: renderCliCompactSummary(await context.compactSession(keepRecent)),
    };
  }
  if (parsed.command === "add-dir") {
    const root = parsed.args.join(" ").trim();
    if (!root) {
      return {
        handled: true,
        output: renderCliError("missing path", "use /add-dir <directory>"),
      };
    }
    const added = await context.addWorkspaceRoot(root);
    if (!added.ok) {
      return {
        handled: true,
        output: renderCliError("add-dir failed", added.error),
      };
    }
    return {
      handled: true,
      output: `added workspace root ${added.root}`,
      showBanner: true,
    };
  }
  if (parsed.command === "tools") {
    return { handled: true, output: renderCliTools(await context.listTools()) };
  }
  if (parsed.command === "skills") {
    const catalog = await context.listSkills();
    return {
      handled: true,
      output: renderCliSkills(catalog.skills, catalog.loadedNames, catalog.missingNames),
    };
  }
  if (parsed.command === "skill") {
    const skillName = parsed.args.join(" ").trim();
    if (!skillName) {
      return {
        handled: true,
        output: renderCliError("missing skill name", "use /skill <name>"),
      };
    }
    const skill = await context.getSkill(skillName);
    if (!skill) {
      return {
        handled: true,
        output: renderCliError("skill not found", `unknown skill: ${skillName}`, "run /skills to inspect available skills"),
      };
    }
    return {
      handled: true,
      output: renderCliSkillDetail(skill),
    };
  }
  if (parsed.command === "sessions") {
    return { handled: true, output: renderCliSessions(context.listSessions()) };
  }
  if (parsed.command === "workflow") {
    const nextWorkflow = parsed.args[0]?.trim().toLowerCase();
    if (!nextWorkflow) {
      return { handled: true, output: `workflow: ${context.getWorkflow()}` };
    }
    if (nextWorkflow !== "agent" && nextWorkflow !== "draw") {
      return {
        handled: true,
        output: renderCliError(
          "unknown workflow",
          `unsupported workflow: ${nextWorkflow}`,
          "use /workflow agent or /workflow draw",
        ),
      };
    }
    context.setWorkflow(nextWorkflow);
    return {
      handled: true,
      output: `workflow set to ${nextWorkflow}`,
      showBanner: true,
    };
  }
  if (parsed.command === "palette") {
    const paletteAction = parsed.args[0]?.trim().toLowerCase();
    if (paletteAction === "open") {
      const rawIndex = parsed.args[1]?.trim() ?? "";
      const entryIndex = Number(rawIndex);
      if (!rawIndex || !Number.isInteger(entryIndex) || entryIndex <= 0) {
        return {
          handled: true,
          output: renderCliError(
            "invalid palette entry",
            `unsupported palette index: ${rawIndex || "(empty)"}`,
            "use /palette open <positive_index>",
          ),
        };
      }
      const candidate = context.openPalette(entryIndex);
      if (!candidate) {
        return {
          handled: true,
          output: renderCliError(
            "palette entry not found",
            `unknown palette entry: ${entryIndex}`,
            "run /palette again before opening a result",
          ),
        };
      }
      const result = await dispatchCliCommand(candidate.command, context);
      if (!result.handled) {
        return {
          handled: true,
          output: renderCliError(
            "palette command failed",
            `unable to execute ${candidate.command}`,
          ),
        };
      }
      return {
        handled: true,
        output: [`palette [${entryIndex}] -> ${candidate.command}`, result.output].filter(Boolean).join("\n"),
        clearScreen: result.clearScreen,
        exit: result.exit,
        showBanner: result.showBanner,
        nextSessionId: result.nextSessionId,
        submitPrompt: result.submitPrompt,
      };
    }
    return {
      handled: true,
      output: renderCliPalette(await context.showPalette(parsed.args.join(" "))),
    };
  }
  if (parsed.command === "history") {
    const direction = parsed.args[0]?.trim().toLowerCase();
    if (direction && direction !== "next" && direction !== "prev" && direction !== "first" && direction !== "last") {
      return {
        handled: true,
        output: renderCliError(
          "unknown history action",
          `unsupported history action: ${parsed.args[0]}`,
          "use /history, /history first, /history prev, /history next, or /history last",
        ),
      };
    }
    return {
      handled: true,
      output: renderCliTranscript(
        context.showTranscript(
          direction === "next" || direction === "prev" || direction === "first" || direction === "last"
            ? direction
            : "current",
        ),
      ),
    };
  }
  if (parsed.command === "search") {
    const action = parsed.args[0]?.trim().toLowerCase();
    if ((action === "next" || action === "prev") && parsed.args.length === 1) {
      const view = context.moveTranscriptSearch(action);
      if (!view) {
        return {
          handled: true,
          output: renderCliError("search not active", "run /search <query> before moving across matches"),
        };
      }
      return {
        handled: true,
        output: renderCliTranscript(view),
      };
    }
    const query = parsed.args.join(" ").trim();
    if (!query) {
      return {
        handled: true,
        output: renderCliError("missing search query", "use /search <query>"),
      };
    }
    return {
      handled: true,
      output: renderCliTranscript(context.searchTranscript(query)),
    };
  }
  if (parsed.command === "peek") {
    const relativeDirection = parsed.args[0]?.trim().toLowerCase();
    if ((relativeDirection === "next" || relativeDirection === "prev") && parsed.args.length === 1) {
      const view = context.moveTranscriptPeek(relativeDirection);
      if (!view) {
        return {
          handled: true,
          output: renderCliError("peek not active", "run /peek <index> before moving to adjacent transcript entries"),
        };
      }
      return {
        handled: true,
        output: renderCliTranscript(view),
      };
    }
    const rawIndex = parsed.args[0]?.trim() ?? "";
    const entryIndex = Number(rawIndex);
    if (!rawIndex || !Number.isInteger(entryIndex) || entryIndex <= 0) {
      return {
        handled: true,
        output: renderCliError("invalid transcript entry", `unsupported entry index: ${rawIndex || "(empty)"}`, "use /peek <positive_index>"),
      };
    }
    const view = context.peekTranscript(entryIndex);
    if (!view) {
      return {
        handled: true,
        output: renderCliError("transcript entry not found", `unknown transcript entry: ${entryIndex}`, "run /history or /search to inspect available entries"),
      };
    }
    return {
      handled: true,
      output: renderCliTranscript(view),
    };
  }
  if (parsed.command === "tail") {
    return {
      handled: true,
      output: renderCliTranscript(context.tailTranscript()),
    };
  }
  if (parsed.command === "next" || parsed.command === "prev") {
    const resolved = cycleSession(context.listSessions(), context.activeSessionId, parsed.command);
    if (!resolved.ok) {
      return { handled: true, output: resolved.output };
    }
    if (!context.useSession(resolved.session.id)) {
      return {
        handled: true,
        output: renderCliError("session not found", `unknown session: ${resolved.session.id}`),
      };
    }
    return {
      handled: true,
      output: `using session [${resolved.index + 1}/${resolved.total}] ${resolved.session.id}`,
      showBanner: true,
      nextSessionId: resolved.session.id,
    };
  }
  if (parsed.command === "doctor") {
    return { handled: true, output: renderCliDoctor(await context.runDoctor()) };
  }
  if (parsed.command === "theme") {
    const nextTheme = parsed.args[0]?.toLowerCase();
    if (!nextTheme) {
      return { handled: true, output: `theme: ${context.getTheme()}` };
    }
    if (nextTheme !== "atlas" && nextTheme !== "plain") {
      return {
        handled: true,
        output: renderCliError("unknown theme", `unsupported theme: ${nextTheme}`, "use /theme atlas or /theme plain"),
      };
    }
    context.setTheme(nextTheme);
    return {
      handled: true,
      output: `theme set to ${nextTheme}`,
      clearScreen: true,
      showBanner: true,
    };
  }
  if (parsed.command === "prompt") {
    const action = parsed.args.join(" ").trim().toLowerCase();
    if (action && action !== "dump") {
      return {
        handled: true,
        output: renderCliError("unknown prompt action", `unsupported prompt action: ${action}`, "use /prompt or /prompt dump"),
      };
    }
    const promptDump = await context.dumpSystemPrompt();
    return {
      handled: true,
      output: renderCliPromptDump(promptDump.dump, promptDump.loadedNames, promptDump.missingNames),
    };
  }
  if (parsed.command === "redraw") {
    return {
      handled: true,
      output: "",
      clearScreen: true,
      showBanner: true,
    };
  }
  if (parsed.command === "clear" || parsed.command === "new") {
    const session = context.createSession();
    return {
      handled: true,
      output: `started fresh session ${session.id}`,
      showBanner: true,
      nextSessionId: session.id,
      clearScreen: parsed.command === "clear",
    };
  }
  if (parsed.command === "use") {
    const resolved = resolveSessionSelector(context.listSessions(), parsed.args.join(" "));
    if (!resolved.ok) {
      return { handled: true, output: resolved.output };
    }
    if (!context.useSession(resolved.session.id)) {
      return {
        handled: true,
        output: renderCliError(
          "session not found",
          `unknown session: ${resolved.session.id}`,
          "run /sessions to inspect available sessions",
        ),
      };
    }
    return {
      handled: true,
      output: `using session [${resolved.index + 1}/${resolved.total}] ${resolved.session.id}`,
      showBanner: true,
      nextSessionId: resolved.session.id,
    };
  }
  if (parsed.command === "exit" || parsed.command === "quit") {
    return { handled: true, output: "bye", exit: true };
  }

  return {
    handled: true,
    output: renderCliError("unknown command", `/${parsed.command} is not available`, "run /help for the supported command set"),
  };
}
