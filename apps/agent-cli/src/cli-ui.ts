import * as process from "node:process";
import type { CliPermissionMode } from "./cli-permissions.js";

export type CliThemeName = "atlas" | "plain";

export type CliBannerInput = {
  title: string;
  workspace: string;
  mode: string;
  model: string;
  sessionId: string | null;
  commands: string[];
};

export type CliStatusSnapshot = {
  workspace: string;
  mode: string;
  model: string;
  activeSessionId: string | null;
  sessionCount: number;
  toolCount: number;
  mcpToolCount: number;
  mcpServerCount: number;
  hookCount: number;
  bridgeEndpoint: string;
  schedulerStatus: string;
  theme: CliThemeName;
  permissionMode: CliPermissionMode;
  pendingApprovals: number;
  workspaceRoots: string[];
  sessionPromptTokens: number;
  sessionCompletionTokens: number;
  dailyPromptTokens: number;
  dailyCompletionTokens: number;
  sessionEstimatedCostUsd: number;
  dailyEstimatedCostUsd: number;
  sessionTokenBudget: number;
  dailyTokenBudget: number;
};

export type CliConfigSnapshot = {
  modelConfigured: boolean;
  model: string;
  openAiBaseUrl: string;
  mcpConfigPath: string;
  mcpConfigured: boolean;
  hooksConfigPath: string;
  hooksConfigured: boolean;
  releaseCheckConfigured: boolean;
  theme: CliThemeName;
  permissionMode: CliPermissionMode;
  workspaceRoots: string[];
};

export type CliDoctorSeverity = "pass" | "warn" | "error";

export type CliDoctorCheck = {
  id: string;
  label: string;
  severity: CliDoctorSeverity;
  reason: string;
  suggestion: string;
};

export type CliDoctorReport = {
  checks: CliDoctorCheck[];
};

export type CliSessionSummary = {
  id: string;
  messageCount: number;
  busy: boolean;
  active: boolean;
};

export type CliPermissionSnapshot = {
  mode: CliPermissionMode;
  pendingApprovals: number;
  approvedApprovals: number;
  rejectedApprovals: number;
  expiredApprovals: number;
  consumedApprovals: number;
};

export type CliUsageSnapshot = {
  model: string;
  sessionPromptTokens: number;
  sessionCompletionTokens: number;
  dailyPromptTokens: number;
  dailyCompletionTokens: number;
  sessionEstimatedCostUsd: number;
  dailyEstimatedCostUsd: number;
  sessionTokenBudget: number;
  dailyTokenBudget: number;
  dayKey: string;
};

export type CliCompactSummary = {
  keptRecent: number;
  oldMessageCount: number;
  newMessageCount: number;
  estimatedBefore: number;
  estimatedAfter: number;
  reducedBy: number;
  transcriptBeforePath: string;
  transcriptAfterPath: string;
};

export type CliApprovalListItem = {
  requestId: string;
  action: string;
  risk: string;
  status: string;
  reason: string;
};

export type CliCloseoutInput = {
  sessionId: string | null;
  changedPaths: string[];
  validationSummary?: string | null;
  risks?: string[];
  suggestions?: string[];
};

export type CliPanelTone = "neutral" | "accent" | "success" | "warning" | "danger";

let CURRENT_THEME: CliThemeName = process.env.AGENT_THEME?.trim() === "plain" ? "plain" : "atlas";
let COLOR_ENABLED =
  !process.env.NO_COLOR && process.env.TERM !== "dumb" && Boolean(process.stdout.isTTY ?? false);

function color(code: string, value: string): string {
  if (!COLOR_ENABLED || CURRENT_THEME === "plain") {
    return value;
  }
  return `${code}${value}\u001b[0m`;
}

function accent(value: string): string {
  return color("\u001b[36m", value);
}

function success(value: string): string {
  return color("\u001b[32m", value);
}

function warning(value: string): string {
  return color("\u001b[33m", value);
}

function danger(value: string): string {
  return color("\u001b[31m", value);
}

function muted(value: string): string {
  return color("\u001b[90m", value);
}

function strong(value: string): string {
  return color("\u001b[1m", value);
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function visibleLength(value: string): number {
  return stripAnsi(value).length;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`;
}

function truncate(value: string, width = process.stdout.columns ?? 100): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= width) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, width - 3))}...`;
}

function toneColor(tone: CliPanelTone, value: string): string {
  if (tone === "accent") {
    return accent(value);
  }
  if (tone === "success") {
    return success(value);
  }
  if (tone === "warning") {
    return warning(value);
  }
  if (tone === "danger") {
    return danger(value);
  }
  return strong(value);
}

function wrapPlainText(value: string, width: number): string[] {
  const normalized = value.replace(/\t/g, "  ").trim();
  if (!normalized) {
    return [""];
  }
  const words = normalized.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (`${current} ${word}`.length <= width) {
      current = `${current} ${word}`;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

function padVisible(value: string, width: number): string {
  const padding = Math.max(0, width - visibleLength(value));
  return `${value}${" ".repeat(padding)}`;
}

function renderRows(rows: Array<{ label: string; value: string }>, width?: number): string {
  const labelWidth = Math.max(...rows.map((row) => row.label.length), 0);
  return rows
    .map((row) => `${muted(row.label.padEnd(labelWidth))}  ${truncate(row.value, width ? width - labelWidth - 2 : undefined)}`)
    .join("\n");
}

export function getCliUiTheme(): CliThemeName {
  return CURRENT_THEME;
}

export function setCliUiTheme(theme: CliThemeName): void {
  CURRENT_THEME = theme;
}

export function setCliUiColorEnabled(enabled: boolean): void {
  COLOR_ENABLED = enabled;
}

export function resetCliUiForTest(): void {
  CURRENT_THEME = "atlas";
  COLOR_ENABLED = true;
}

export function renderCliPrompt(sessionId: string | null): string {
  const suffix = sessionId ? sessionId.slice(0, 6) : "shell";
  return `${accent(`agent:${suffix}`)} ${muted(">>")} `;
}

export function renderCliBadge(label: string, tone: CliPanelTone = "accent"): string {
  return toneColor(tone, `[${label}]`);
}

export function renderCliBanner(input: CliBannerInput): string {
  return [
    strong(input.title),
    renderRows([
      { label: "workspace", value: input.workspace },
      { label: "mode", value: input.mode },
      { label: "model", value: input.model },
      { label: "session", value: input.sessionId ?? "(none)" },
      { label: "commands", value: input.commands.join(" ") },
    ]),
    "",
  ].join("\n");
}

export function renderCliStatus(snapshot: CliStatusSnapshot): string {
  const sessionTokens = snapshot.sessionPromptTokens + snapshot.sessionCompletionTokens;
  const dailyTokens = snapshot.dailyPromptTokens + snapshot.dailyCompletionTokens;
  return [
    strong("Status"),
    renderRows([
      { label: "workspace", value: snapshot.workspace },
      { label: "mode", value: snapshot.mode },
      { label: "model", value: snapshot.model },
      { label: "session", value: snapshot.activeSessionId ?? "(none)" },
      { label: "sessions", value: String(snapshot.sessionCount) },
      { label: "tools", value: `${snapshot.toolCount} total / ${snapshot.mcpToolCount} mcp / ${snapshot.mcpServerCount} servers` },
      { label: "hooks", value: String(snapshot.hookCount) },
      { label: "permissions", value: `${snapshot.permissionMode} / ${snapshot.pendingApprovals} pending approvals` },
      { label: "roots", value: snapshot.workspaceRoots.join(", ") },
      {
        label: "usage",
        value:
          `session ${sessionTokens}/${snapshot.sessionTokenBudget} tokens ${formatUsd(snapshot.sessionEstimatedCostUsd)} | ` +
          `daily ${dailyTokens}/${snapshot.dailyTokenBudget} tokens ${formatUsd(snapshot.dailyEstimatedCostUsd)}`,
      },
      { label: "bridge", value: snapshot.bridgeEndpoint },
      { label: "scheduler", value: snapshot.schedulerStatus },
      { label: "theme", value: snapshot.theme },
    ]),
  ].join("\n");
}

export function renderCliConfig(snapshot: CliConfigSnapshot): string {
  return [
    strong("Config"),
    renderRows([
      { label: "model", value: snapshot.modelConfigured ? snapshot.model : "missing MODEL_ID" },
      { label: "base url", value: snapshot.openAiBaseUrl || "(default)" },
      { label: "mcp", value: `${snapshot.mcpConfigured ? "configured" : "not configured"} @ ${snapshot.mcpConfigPath}` },
      { label: "hooks", value: `${snapshot.hooksConfigured ? "configured" : "not configured"} @ ${snapshot.hooksConfigPath}` },
      { label: "release", value: snapshot.releaseCheckConfigured ? "release:check available" : "release:check missing" },
      { label: "permissions", value: snapshot.permissionMode },
      { label: "roots", value: snapshot.workspaceRoots.join(", ") },
      { label: "theme", value: snapshot.theme },
    ]),
  ].join("\n");
}

export function renderCliHelp(): string {
  const commands = [
    "/help       show commands and examples",
    "/status     show runtime status",
    "/config     show config paths and current theme",
    "/model      show or set model: /model gpt-5-mini",
    "/permissions show or set permission mode",
    "/approvals  list approval requests",
    "/approve    approve a request: /approve <id>",
    "/reject     reject a request: /reject <id>",
    "/cost       show token and cost summary",
    "/compact    compact current session history",
    "/add-dir    allow another workspace root",
    "/tools      list available tools",
    "/sessions   list sessions",
    "/doctor     run local readiness checks",
    "/theme      show or set theme: /theme atlas|plain",
    "/clear      start a fresh session",
    "/new        alias for /clear",
    "/redraw     clear screen and redraw banner",
    "/use <id>   switch active session",
    "/exit       leave the shell",
    "!<cmd>      run a direct shell command",
  ];
  return [strong("Commands"), ...commands].join("\n");
}

export function renderCliError(title: string, message: string, suggestion?: string): string {
  const lines = [danger(`error: ${title}`), message];
  if (suggestion) {
    lines.push(`${muted("next")}  ${suggestion}`);
  }
  return lines.join("\n");
}

export function renderCliTools(tools: Array<Record<string, string>>): string {
  if (tools.length === 0) {
    return `${strong("Tools")}\n${muted("No tools available.")}`;
  }
  return [
    strong("Tools"),
    ...tools.map((tool) =>
      `${accent(tool.name ?? "(unnamed)")} [${tool.target ?? "unknown"}] ${truncate(tool.description ?? "", 96)}`,
    ),
  ].join("\n");
}

export function renderCliSessions(sessions: CliSessionSummary[]): string {
  if (sessions.length === 0) {
    return `${strong("Sessions")}\n${muted("No sessions available.")}`;
  }
  return [
    strong("Sessions"),
    ...sessions.map((session) => {
      const marker = session.active ? "*" : " ";
      const busy = session.busy ? warning("busy") : success("idle");
      return `${marker} ${accent(session.id)} messages=${session.messageCount} status=${busy}`;
    }),
  ].join("\n");
}

export function renderCliDoctor(report: CliDoctorReport): string {
  const rows = report.checks.map((check) => {
    const severity =
      check.severity === "pass"
        ? success("pass")
        : check.severity === "warn"
          ? warning("warn")
          : danger("error");
    const suggestion = check.suggestion ? ` | ${check.suggestion}` : "";
    return `${severity} ${check.label}: ${check.reason}${suggestion}`;
  });
  return [strong("Doctor"), ...rows].join("\n");
}

export function renderCliPermissions(snapshot: CliPermissionSnapshot): string {
  return [
    strong("Permissions"),
    renderRows([
      { label: "mode", value: snapshot.mode },
      { label: "pending", value: String(snapshot.pendingApprovals) },
      { label: "approved", value: String(snapshot.approvedApprovals) },
      { label: "rejected", value: String(snapshot.rejectedApprovals) },
      { label: "expired", value: String(snapshot.expiredApprovals) },
      { label: "consumed", value: String(snapshot.consumedApprovals) },
    ]),
  ].join("\n");
}

export function renderCliApprovals(items: CliApprovalListItem[]): string {
  if (items.length === 0) {
    return `${strong("Approvals")}\n${muted("No approval requests found.")}`;
  }
  return [
    strong("Approvals"),
    ...items.map((item) => {
      const summary = `${item.status} ${item.requestId} ${item.action} (${item.risk})`.trim();
      return item.reason ? `${summary}\n${muted("reason")}  ${truncate(item.reason, 96)}` : summary;
    }),
  ].join("\n");
}

export function renderCliUsage(snapshot: CliUsageSnapshot): string {
  const sessionTokens = snapshot.sessionPromptTokens + snapshot.sessionCompletionTokens;
  const dailyTokens = snapshot.dailyPromptTokens + snapshot.dailyCompletionTokens;
  return [
    strong("Usage"),
    renderRows([
      { label: "model", value: snapshot.model },
      {
        label: "session",
        value: `${sessionTokens}/${snapshot.sessionTokenBudget} tokens (${snapshot.sessionPromptTokens} prompt / ${snapshot.sessionCompletionTokens} completion)`,
      },
      { label: "session $", value: formatUsd(snapshot.sessionEstimatedCostUsd) },
      {
        label: "daily",
        value: `${dailyTokens}/${snapshot.dailyTokenBudget} tokens (${snapshot.dailyPromptTokens} prompt / ${snapshot.dailyCompletionTokens} completion)`,
      },
      { label: "daily $", value: formatUsd(snapshot.dailyEstimatedCostUsd) },
      { label: "day", value: snapshot.dayKey },
    ]),
  ].join("\n");
}

export function renderCliCompactSummary(summary: CliCompactSummary): string {
  return [
    strong("Compact"),
    renderRows([
      { label: "messages", value: `${summary.oldMessageCount} -> ${summary.newMessageCount}` },
      { label: "tokens", value: `${summary.estimatedBefore} -> ${summary.estimatedAfter} (-${summary.reducedBy})` },
      { label: "keep recent", value: String(summary.keptRecent) },
      { label: "before", value: summary.transcriptBeforePath },
      { label: "after", value: summary.transcriptAfterPath },
    ]),
  ].join("\n");
}

export function renderCliEvent(input: {
  kind: "tool" | "scheduled" | "approval" | "system";
  status: "running" | "done" | "failed" | "blocked" | "due" | "info";
  title: string;
  detail?: string;
  durationMs?: number;
}): string {
  const statusText =
    input.status === "done"
      ? success(input.status)
      : input.status === "running" || input.status === "due"
        ? warning(input.status)
        : input.status === "info"
          ? accent(input.status)
          : danger(input.status);
  const duration = input.durationMs && input.durationMs > 0 ? ` ${muted(`${input.durationMs}ms`)}` : "";
  const head = `${statusText} ${input.kind} ${accent(input.title)}${duration}`;
  if (!input.detail) {
    return head;
  }
  return `${head}\n${muted("detail")}  ${truncate(input.detail, 120)}`;
}

export function renderCliCloseout(input: CliCloseoutInput): string {
  const changed = input.changedPaths.length > 0 ? input.changedPaths.join(", ") : "no workspace changes recorded";
  const lines = [
    strong("Closeout"),
    renderRows([
      { label: "session", value: input.sessionId ?? "(none)" },
      { label: "changes", value: changed },
      { label: "validation", value: input.validationSummary?.trim() || "not run" },
    ]),
  ];
  if (input.risks && input.risks.length > 0) {
    lines.push(`risks  ${input.risks.join(" | ")}`);
  }
  if (input.suggestions && input.suggestions.length > 0) {
    lines.push(`next   ${input.suggestions.join(" | ")}`);
  }
  return lines.join("\n");
}

export function renderCliSection(title: string, body: string): string {
  return `${strong(title)}\n${body}`;
}

export function renderClearScreen(): string {
  return "\u001b[2J\u001b[H";
}

export function renderCliFooter(segments: string[], width = process.stdout.columns ?? 120): string {
  const content = truncate(segments.join("  |  "), Math.max(24, width - 2));
  return muted(padVisible(content, Math.max(24, width - 2)));
}

export function renderCliPanel(input: {
  title: string;
  lines: string[];
  width: number;
  tone?: CliPanelTone;
  minBodyLines?: number;
}): string[] {
  const width = Math.max(24, input.width);
  const innerWidth = width - 4;
  const title = truncate(input.title, innerWidth);
  const header = `${toneColor(input.tone ?? "neutral", `+ ${title}`)} ${"-".repeat(Math.max(0, width - visibleLength(title) - 4))}+`;
  const wrappedLines = input.lines.flatMap((line) => wrapPlainText(line, innerWidth));
  while (wrappedLines.length < (input.minBodyLines ?? 0)) {
    wrappedLines.push("");
  }
  const body = wrappedLines.map((line) => `| ${padVisible(truncate(line, innerWidth), innerWidth)} |`);
  const footer = `+${"-".repeat(width - 2)}+`;
  return [header, ...body, footer];
}

export function mergeCliColumns(columns: string[][], gap = 2): string[] {
  const heights = columns.map((column) => column.length);
  const widths = columns.map((column) =>
    column.reduce((max, line) => Math.max(max, visibleLength(line)), 0),
  );
  const rows = Math.max(0, ...heights);
  const out: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    const parts = columns.map((column, columnIndex) =>
      padVisible(column[row] ?? "", widths[columnIndex] ?? 0),
    );
    out.push(parts.join(" ".repeat(gap)));
  }
  return out;
}
