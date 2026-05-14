import * as process from "node:process";
import {
  getCliPaletteGroupLabel,
  type CliPaletteCandidate,
  type CliPaletteView,
} from "./cli-palette.js";
import type { CliComposePreview } from "./cli-composer.js";
import type { CliPermissionMode } from "./cli-permissions.js";
import type { PromptDump } from "./prompt/inspect.js";
import type { CliTranscriptEntry, CliTranscriptView } from "./cli-transcript.js";
import { getCliWorkflowLabel, type CliWorkflowMode } from "./cli-workflow.js";

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

export type CliComposerSnapshot = {
  active: boolean;
  lineCount: number;
  charCount: number;
};

export type CliSkillSummary = {
  name: string;
  description: string;
  path: string;
  root: string;
  loaded: boolean;
};

export type CliSkillDetail = CliSkillSummary & {
  metadata: Record<string, string>;
  content: string;
};

export type CliHelpTopicId =
  | "overview"
  | "draft"
  | "sessions"
  | "runtime"
  | "approvals"
  | "transcript"
  | "workflow"
  | "palette"
  | "all";

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

const CLI_HELP_TOPICS = [
  {
    id: "draft",
    title: "Draft",
    summary: "Compose longer prompts locally before they enter the model request path.",
    commands: [
      "/compose    start or resume multi-line draft mode",
      "/preview    inspect the current draft with numbered lines",
      "/pop [n]    remove the latest 1 or N draft line(s)",
      "/send       submit the current draft",
      "/cancel     discard the current draft",
    ],
    examples: ["/compose", "/preview", "/pop 2", "/send"],
  },
  {
    id: "sessions",
    title: "Sessions",
    summary: "Navigate local sessions without memorizing full session ids.",
    commands: [
      "/sessions   list local sessions with index and status",
      "/use <x>    switch by id, prefix, index, or latest",
      "/next       move to the next session",
      "/prev       move to the previous session",
      "/clear      start a fresh session",
      "/new        alias for /clear",
    ],
    examples: ["/sessions", "/use 2", "/use latest", "/next"],
  },
  {
    id: "runtime",
    title: "Runtime",
    summary: "Inspect and control the local runtime surface without asking the model.",
    commands: [
      "/status     show runtime status",
      "/config     show config paths and current theme",
      "/model      show or set model: /model gpt-5-mini",
      "/permissions show or set permission mode",
      "/skills     list discovered local skills",
      "/skill <x>  inspect one local skill body",
      "/prompt     dump the current stable system prompt",
      "/cost       show token and cost summary",
      "/compact    compact current session history",
      "/redraw     clear screen and redraw banner",
    ],
    examples: ["/status", "/skills", "/skill openspec-apply-change", "/prompt"],
  },
  {
    id: "approvals",
    title: "Approvals",
    summary: "Inspect approval queues and resolve requests from the local control surface.",
    commands: [
      "/approvals  list approval requests",
      "/approve    approve a request: /approve <id>",
      "/reject     reject a request: /reject <id>",
      "/doctor     run local readiness checks",
      "/add-dir    allow another workspace root",
      "/tools      list available tools",
      "/theme      show or set theme: /theme atlas|plain",
      "!<cmd>      run a direct shell command",
      "/exit       leave the shell",
    ],
    examples: ["/approvals", "/approve apr_1", "/doctor", "!pnpm test"],
  },
  {
    id: "transcript",
    title: "Transcript",
    summary: "Browse, search, and expand the local session transcript without leaving the shell.",
    commands: [
      "/history    browse the current transcript window",
      "/history prev move to the previous transcript page",
      "/history next move to the next transcript page",
      "/history first jump to the first transcript page",
      "/history last jump to the latest transcript page",
      "/search <q> search the current transcript",
      "/search next move to the next search match",
      "/search prev move to the previous search match",
      "/peek <n>   expand one transcript entry",
      "/peek next  expand the next transcript entry",
      "/peek prev  expand the previous transcript entry",
      "/tail       return to the live tail view",
    ],
    examples: ["/history last", "/search bug", "/search next", "/peek 12", "/peek next", "/tail"],
  },
  {
    id: "workflow",
    title: "Workflow",
    summary: "Switch the local CLI/TUI surface between general agent work and draw-oriented brief work.",
    commands: [
      "/workflow       show the active local workflow",
      "/workflow agent switch to the general agent workflow surface",
      "/workflow draw  switch to the draw-oriented workflow surface",
      "/palette draw   open workflow-related local launcher actions",
    ],
    examples: ["/workflow", "/workflow draw", "/workflow agent", "/palette workflow"],
  },
  {
    id: "palette",
    title: "Palette",
    summary: "Launch high-frequency local actions from one fuzzy-searchable control surface.",
    commands: [
      "/palette       show top local action candidates",
      "/palette <q>   fuzzy-search local action candidates",
      "/palette open <n> execute one palette result by index",
      "Ctrl+K         open the local command palette in TUI",
    ],
    examples: ["/palette", "/palette review", "/palette open 2"],
  },
] as const satisfies ReadonlyArray<{
  id: Exclude<CliHelpTopicId, "overview" | "all">;
  title: string;
  summary: string;
  commands: readonly string[];
  examples: readonly string[];
}>;

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

export function renderCliPrompt(
  sessionId: string | null,
  composer?: CliComposerSnapshot,
  workflow: CliWorkflowMode = "agent",
): string {
  const suffix = sessionId ? sessionId.slice(0, 6) : "shell";
  const workflowLabel = getCliWorkflowLabel(workflow);
  if (composer?.active) {
    const prefix = workflow === "draw" ? `draw-draft:${suffix}` : `draft:${suffix}`;
    return `${warning(prefix)} ${muted(`${composer.lineCount}l/${composer.charCount}c`)} ${muted("..")} `;
  }
  return `${accent(`${workflowLabel}:${suffix}`)} ${muted(">>")} `;
}

export function listCliHelpTopics(): Array<Exclude<CliHelpTopicId, "overview">> {
  return [...CLI_HELP_TOPICS.map((topic) => topic.id), "all"];
}

export function resolveCliHelpTopic(input?: string | null): CliHelpTopicId | null {
  const normalized = input?.trim().toLowerCase();
  if (!normalized) {
    return "overview";
  }
  if (normalized === "all") {
    return "all";
  }
  return (CLI_HELP_TOPICS.find((topic) => topic.id === normalized)?.id as CliHelpTopicId | undefined) ?? null;
}

function renderCliHelpTopic(topicId: Exclude<CliHelpTopicId, "overview" | "all">): string {
  const topic = CLI_HELP_TOPICS.find((entry) => entry.id === topicId);
  if (!topic) {
    return "";
  }
  return [
    strong(`Help: ${topic.title}`),
    topic.summary,
    "",
    strong("Commands"),
    ...topic.commands,
    "",
    strong("Examples"),
    ...topic.examples.map((example) => `- ${example}`),
  ].join("\n");
}

export function renderCliGuideLines(input: {
  composerActive: boolean;
  sessionCount: number;
  pendingApprovals: number;
  startupIssue?: boolean;
  workflow?: CliWorkflowMode;
}): string[] {
  const workflow = input.workflow ?? "agent";
  if (input.composerActive) {
    const composeLabel = workflow === "draw" ? "brief" : "draft";
    return [
      "help      /help draft or Ctrl+G",
      workflow === "draw" ? "workflow  /workflow agent | /workflow draw" : "palette   /palette or Ctrl+K launches local actions",
      `${composeLabel.padEnd(9)} plain text appends to the current ${composeLabel}`,
      "review    /preview shows numbered draft lines",
      "edit      /pop or /pop 3 removes recent lines",
      "send      /send submits the current draft",
      "cancel    Esc or /cancel discards the draft",
      "browse    /history /search <q> /search next /peek <n>",
      "session   /next /prev keeps local navigation nearby",
    ];
  }
  if (workflow === "draw") {
    return [
      "workflow  /workflow agent | /workflow draw",
      "palette   /palette draw /palette workflow",
      "brief     /compose starts a multi-line draw brief",
      "review    /preview inspects numbered brief lines",
      "browse    /history last /search bug /peek 12 /tail",
      "runtime   /status /model /permissions /skills /prompt",
      input.pendingApprovals > 0 ? "approvals /approvals /approve <id> /reject <id>" : "workspace /doctor /add-dir /theme",
      "shell     !<cmd> runs a direct shell command",
    ];
  }
  return [
    "help      /help /help sessions /help palette",
    "workflow  /workflow agent | /workflow draw",
    "palette   /palette review /palette open 2",
    input.sessionCount > 0 ? "session   /sessions /use 2 /next /prev" : "session   /clear creates the first local session",
    "browse    /history last /search bug /peek 12 /tail",
    input.startupIssue ? "startup   /model <id> reactivates local chat" : "runtime   /status /model /permissions /skills /prompt",
    input.pendingApprovals > 0
      ? "approvals /approvals /approve <id> /reject <id>"
      : "workspace /doctor /add-dir /theme",
    "compose   /compose starts a multi-line draft",
    "shell     !<cmd> runs a direct shell command",
  ];
}

export function renderCliShortcutLines(input: { composerActive: boolean }): string[] {
  return [
    "ctrl+g    help",
    "ctrl+k    palette",
    "ctrl+n    next session",
    "ctrl+p    previous session",
    "ctrl+l    redraw screen",
    input.composerActive ? "esc       cancel draft" : "esc       draft cancel only",
  ];
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

export function renderCliHelp(topic: CliHelpTopicId = "overview"): string {
  if (topic === "all") {
    return [
      renderCliHelp("overview"),
      "",
      ...CLI_HELP_TOPICS.map((entry) => renderCliHelp(entry.id)),
    ].join("\n\n");
  }
  if (topic !== "overview") {
    return renderCliHelpTopic(topic);
  }
  return [
    strong("Commands"),
    "topics     /help draft | /help sessions | /help runtime | /help approvals | /help transcript | /help workflow | /help palette | /help all",
    "palette    /palette /palette <query> /palette open <index>",
    "draft      /compose /preview /pop /send /cancel",
    "sessions   /sessions /use /next /prev /clear",
    "workflow   /workflow agent | /workflow draw",
    "browse     /history /search /peek /tail",
    "runtime    /status /config /model /permissions /skills /skill /prompt /cost /compact /redraw",
    "approvals  /approvals /approve /reject /doctor /add-dir /tools /theme",
    "shell      !<cmd> | /exit",
    "TUI keys    Ctrl+G help | Ctrl+K palette | Ctrl+N next | Ctrl+P prev | Ctrl+L redraw | Esc cancel draft",
    "",
    strong("Examples"),
    "- /help draft",
    "- /palette review",
    "- /help sessions",
    "- /search hook blocked",
    "- /model gpt-5-mini",
    "- /permissions plan",
  ].join("\n");
}

function renderPaletteCandidateLine(candidate: CliPaletteCandidate, index: number): string {
  return `[${index + 1}] ${truncate(candidate.title, 52)} -> ${candidate.command}`;
}

function renderGroupedPaletteCandidateLines(candidates: CliPaletteCandidate[], maxEntries: number): string[] {
  const visibleCandidates = candidates.slice(0, maxEntries);
  const lines: string[] = [];
  let currentGroup: CliPaletteCandidate["group"] | null = null;
  for (const [index, candidate] of visibleCandidates.entries()) {
    if (candidate.group !== currentGroup) {
      if (lines.length > 0) {
        lines.push("");
      }
      currentGroup = candidate.group;
      lines.push(`group     ${getCliPaletteGroupLabel(candidate.group)}`);
    }
    lines.push(renderPaletteCandidateLine(candidate, index));
  }
  return lines;
}

export function renderCliPaletteLines(view: CliPaletteView, maxEntries = 8): string[] {
  return [
    `query     ${view.query || "(top actions)"}`,
    `results   ${view.candidates.length} shown / ${view.total} total`,
    "open      /palette open <index>",
    "hints     grouped local actions",
    "",
    ...(view.candidates.length > 0 ? renderGroupedPaletteCandidateLines(view.candidates, maxEntries) : ["No palette candidates found."]),
  ];
}

export function renderCliPalette(view: CliPaletteView): string {
  return [strong("Palette"), ...renderCliPaletteLines(view, 8)].join("\n");
}

function formatTranscriptIndex(index: number): string {
  return `#${String(index).padStart(2, "0")}`;
}

function renderTranscriptEntrySummary(entry: CliTranscriptEntry): string {
  return `[${formatTranscriptIndex(entry.index)}] ${entry.role.padEnd(9)} ${truncate(entry.preview, 88)}`;
}

function renderTranscriptContentLines(entry: CliTranscriptEntry, limit?: number): string[] {
  const lines = entry.content ? entry.content.split("\n") : ["(empty)"];
  const total = lines.length;
  const max = limit && limit > 0 ? Math.min(limit, total) : total;
  const rendered = lines.slice(0, max).map((line, index) => `${String(index + 1).padStart(2, "0")}| ${line}`.trimEnd());
  if (max < total) {
    rendered.push(`... ${total - max} more line(s)`);
  }
  return rendered;
}

export function renderCliTranscriptLines(view: CliTranscriptView, maxEntries = 10): string[] {
  if (view.mode === "peek") {
    return [
      `entry     ${formatTranscriptIndex(view.entry.index)} ${view.entry.role} ${view.entry.lineCount} lines / ${view.entry.charCount} chars`,
      `browse    /peek prev | /peek next | /tail | /history`,
      `nav       ${view.hasPrev ? "prev" : "-"} | ${view.hasNext ? "next" : "-"}`,
      `summary   ${truncate(view.entry.preview, 96)}`,
      "",
      ...renderTranscriptContentLines(view.entry, maxEntries),
    ];
  }
  if (view.mode === "search") {
    const matches = view.matches.slice(0, maxEntries);
    return [
      `query     ${view.query}`,
      `matches   ${view.matches.length} / ${view.total}`,
      `focus     ${
        view.selectedEntry
          ? `[${view.selectedIndex + 1}/${view.matches.length}] ${formatTranscriptIndex(view.selectedEntry.index)} ${view.selectedEntry.role}`
          : "(none)"
      }`,
      `browse    /search prev | /search next | /peek <n> | /tail`,
      "",
      ...(matches.length > 0
        ? matches.map((entry, index) => `${index === view.selectedIndex ? ">" : " "} ${renderTranscriptEntrySummary(entry)}`)
        : ["No transcript matches found."]),
      ...(view.matches.length > matches.length ? [`... ${view.matches.length - matches.length} more match(es)`] : []),
    ];
  }
  return [
    `${view.mode === "tail" ? "tail" : "window"}      ${view.total === 0 ? "0/0" : `${view.start}-${view.end} / ${view.total}`}`,
    `browse    /history first | /history prev | /history next | /history last`,
    `detail    /search <query> | /peek <n> | /tail`,
    "",
    ...(view.entries.length > 0 ? view.entries.slice(0, maxEntries).map(renderTranscriptEntrySummary) : ["No transcript yet. Type a prompt or run /help."]),
  ];
}

export function renderCliTranscript(view: CliTranscriptView): string {
  return [strong("Transcript"), ...renderCliTranscriptLines(view, 12)].join("\n");
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

export function renderCliSkills(skills: CliSkillSummary[], loadedNames: string[], missingNames: string[]): string {
  const lines = [strong("Skills")];
  if (skills.length === 0) {
    lines.push(muted("No skills discovered. Add .codex/skills/**/SKILL.md or set AGENT_SKILL_ROOTS."));
  } else {
    lines.push(
      ...skills.map((skill) => {
        const state = skill.loaded ? success("loaded") : muted("available");
        const description = skill.description ? ` ${truncate(skill.description, 72)}` : "";
        return `${state} ${accent(skill.name)}${description}\n${muted("path")}  ${skill.path}`;
      }),
    );
  }
  if (loadedNames.length > 0) {
    lines.push("", `${muted("prompt")}  ${loadedNames.join(", ")}`);
  }
  if (missingNames.length > 0) {
    lines.push(`${muted("missing")}  ${missingNames.join(", ")}`);
  }
  return lines.join("\n");
}

export function renderCliSkillDetail(skill: CliSkillDetail): string {
  const metadataEntries = Object.entries(skill.metadata);
  const metadata = metadataEntries.length > 0
    ? metadataEntries.map(([key, value]) => `${key}: ${value}`).join(", ")
    : "(none)";
  return [
    strong(`Skill: ${skill.name}`),
    renderRows([
      { label: "state", value: skill.loaded ? "loaded into prompt" : "available" },
      { label: "path", value: skill.path },
      { label: "root", value: skill.root },
      { label: "meta", value: metadata },
    ]),
    "",
    skill.content.trim() || muted("(empty skill body)"),
  ].join("\n");
}

export function renderCliPromptDump(
  dump: PromptDump,
  loadedNames: string[],
  missingNames: string[],
): string {
  return [
    strong("System Prompt"),
    renderRows([
      { label: "stable", value: dump.stableSectionIds.join(", ") || "(none)" },
      { label: "dynamic", value: dump.dynamicSectionIds.join(", ") || "(none)" },
      { label: "skills", value: loadedNames.join(", ") || "(none)" },
      { label: "missing", value: missingNames.join(", ") || "(none)" },
    ]),
    "",
    strong("Primary"),
    dump.primarySystemPrompt || muted("(empty)"),
    "",
    strong("Supplemental"),
    dump.supplementalSystemMessages.length > 0
      ? dump.supplementalSystemMessages.join("\n\n---\n\n")
      : muted("(none)"),
  ].join("\n");
}

export function renderCliSessions(sessions: CliSessionSummary[]): string {
  if (sessions.length === 0) {
    return `${strong("Sessions")}\n${muted("No sessions available.")}`;
  }
  return [
    strong("Sessions"),
    ...sessions.map((session, index) => {
      const marker = session.active ? "*" : " ";
      const busy = session.busy ? warning("busy") : success("idle");
      return `${marker} [${index + 1}] ${accent(session.id)} messages=${session.messageCount} status=${busy}`;
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

export function renderCliComposerLines(preview: CliComposePreview, limit?: number): string[] {
  const lines = preview.content.split("\n");
  if (preview.lineCount === 0) {
    return ["(empty draft)"];
  }
  const total = lines.length;
  const startIndex = limit && limit > 0 && total > limit ? total - limit : 0;
  const lineNumberWidth = Math.max(2, String(total).length);
  const rendered: string[] = [];
  if (startIndex > 0) {
    rendered.push(`... ${startIndex} earlier line(s)`);
  }
  for (let index = startIndex; index < total; index += 1) {
    rendered.push(`${String(index + 1).padStart(lineNumberWidth, "0")}| ${lines[index] ?? ""}`.trimEnd());
  }
  return rendered;
}

export function renderCliComposer(preview: CliComposePreview): string {
  return [
    strong("Composer"),
    renderRows([
      { label: "lines", value: String(preview.lineCount) },
      { label: "chars", value: String(preview.charCount) },
    ]),
    "",
    ...renderCliComposerLines(preview),
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
