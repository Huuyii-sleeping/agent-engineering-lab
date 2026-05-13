import {
  renderCliApprovals,
  renderCliCompactSummary,
  renderCliConfig,
  renderCliDoctor,
  renderCliError,
  renderCliHelp,
  renderCliPermissions,
  renderCliSessions,
  renderCliStatus,
  renderCliTools,
  renderCliUsage,
  type CliCompactSummary,
  type CliConfigSnapshot,
  type CliPermissionSnapshot,
  type CliSessionSummary,
  type CliStatusSnapshot,
  type CliThemeName,
  type CliUsageSnapshot,
} from "./cli-ui.js";
import type { CliDoctorReport } from "./cli-ui.js";
import type { CliPermissionMode } from "./cli-permissions.js";

export type CliCommandResult =
  | { handled: false }
  | {
      handled: true;
      output: string;
      clearScreen?: boolean;
      exit?: boolean;
      showBanner?: boolean;
      nextSessionId?: string | null;
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
  getUsage(): Promise<CliUsageSnapshot>;
  compactSession(keepRecent?: number): Promise<CliCompactSummary>;
  getModel(): string;
  setModel(model: string): Promise<boolean>;
  addWorkspaceRoot(root: string): Promise<{ ok: true; root: string } | { ok: false; error: string }>;
  runDoctor(): Promise<CliDoctorReport>;
  getTheme(): CliThemeName;
  setTheme(theme: CliThemeName): boolean;
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

export async function dispatchCliCommand(
  input: string,
  context: CliCommandContext,
): Promise<CliCommandResult> {
  const approvalShortcut = await maybeHandleApprovalShortcut(input, context);
  if (approvalShortcut) {
    return approvalShortcut;
  }
  const parsed = parseArgs(input);
  if (!parsed) {
    return { handled: false };
  }

  if (parsed.command === "help") {
    return { handled: true, output: renderCliHelp() };
  }
  if (parsed.command === "status") {
    return { handled: true, output: renderCliStatus(await context.getStatus()) };
  }
  if (parsed.command === "config") {
    return { handled: true, output: renderCliConfig(await context.getConfig()) };
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
  if (parsed.command === "sessions") {
    return { handled: true, output: renderCliSessions(context.listSessions()) };
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
    const sessionId = parsed.args[0]?.trim() ?? "";
    if (!sessionId) {
      return {
        handled: true,
        output: renderCliError("missing session id", "use /use <session_id>"),
      };
    }
    if (!context.useSession(sessionId)) {
      return {
        handled: true,
        output: renderCliError("session not found", `unknown session: ${sessionId}`, "run /sessions to inspect available sessions"),
      };
    }
    return {
      handled: true,
      output: `using session ${sessionId}`,
      showBanner: true,
      nextSessionId: sessionId,
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
