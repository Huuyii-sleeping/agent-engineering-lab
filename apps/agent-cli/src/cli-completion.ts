import type { CliSessionSummary } from "./cli-ui.js";

export type CliCompletionContext = {
  sessions: CliSessionSummary[];
  helpTopics: string[];
  transcriptEntryCount: number;
  paletteEntryCount: number;
  model: string;
};

const CLI_COMMANDS = [
  "help",
  "compose",
  "preview",
  "pop",
  "send",
  "cancel",
  "status",
  "config",
  "model",
  "permissions",
  "approvals",
  "approve",
  "reject",
  "cost",
  "usage",
  "compact",
  "add-dir",
  "tools",
  "sessions",
  "palette",
  "history",
  "search",
  "peek",
  "tail",
  "next",
  "prev",
  "doctor",
  "theme",
  "redraw",
  "clear",
  "new",
  "use",
  "exit",
  "quit",
];

const APPROVAL_STATUSES = ["pending", "approved", "rejected", "expired", "consumed"];
const PERMISSION_MODES = ["default", "accept-edits", "plan"];
const THEMES = ["atlas", "plain"];
const KNOWN_MODELS = ["gpt-5", "gpt-5-mini", "gpt-4o", "gpt-4o-mini"];
const PALETTE_QUERIES = ["review", "session", "history", "help", "runtime", "approval", "draft"];

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function listRecentTranscriptIndexes(total: number, limit = 12): number[] {
  const start = Math.max(1, total - limit + 1);
  const indexes: number[] = [];
  for (let index = total; index >= start; index -= 1) {
    indexes.push(index);
  }
  return indexes;
}

export function completeCliLine(line: string, context: CliCompletionContext): [string[], string] {
  const source = line.trimStart();
  if (!source.startsWith("/")) {
    return [[], line];
  }

  const endsWithSpace = /\s$/.test(source);
  const tokens = source.split(/\s+/).filter(Boolean);
  const commandToken = tokens[0] ?? "/";
  const command = commandToken.slice(1).toLowerCase();

  let candidates: string[] = [];
  if (tokens.length <= 1 && !endsWithSpace) {
    candidates = CLI_COMMANDS.map((item) => `/${item}`);
  } else if (tokens.length === 1 && endsWithSpace) {
    candidates = completionCandidatesForCommand(command, context);
  } else {
    candidates = completionCandidatesForCommand(command, context);
  }

  const hits = candidates.filter((candidate) => candidate.startsWith(source));
  return [hits.length > 0 ? hits : candidates, source];
}

function completionCandidatesForCommand(command: string, context: CliCompletionContext): string[] {
  if (command === "help") {
    return context.helpTopics.map((topic) => `/help ${topic}`);
  }
  if (command === "permissions") {
    return PERMISSION_MODES.map((mode) => `/permissions ${mode}`);
  }
  if (command === "theme") {
    return THEMES.map((theme) => `/theme ${theme}`);
  }
  if (command === "approvals") {
    return APPROVAL_STATUSES.map((status) => `/approvals ${status}`);
  }
  if (command === "model") {
    return uniqueValues([context.model, ...KNOWN_MODELS]).map((model) => `/model ${model}`);
  }
  if (command === "use") {
    const sessionIndexes = context.sessions.map((_, index) => `/use ${index + 1}`);
    const sessionIds = context.sessions.map((session) => `/use ${session.id}`);
    return uniqueValues(["/use latest", ...sessionIndexes, ...sessionIds]);
  }
  if (command === "history") {
    return ["/history", "/history prev", "/history next"];
  }
  if (command === "palette") {
    const openCandidates = context.paletteEntryCount > 0
      ? Array.from({ length: context.paletteEntryCount }, (_, index) => `/palette open ${index + 1}`)
      : [];
    const queryCandidates = uniqueValues([
      ...context.helpTopics.filter((topic) => topic !== "all").map((topic) => `/palette ${topic}`),
      ...PALETTE_QUERIES.map((query) => `/palette ${query}`),
    ]);
    return ["/palette", ...queryCandidates, ...openCandidates];
  }
  if (command === "peek") {
    return listRecentTranscriptIndexes(context.transcriptEntryCount).map((index) => `/peek ${index}`);
  }
  if (command === "approve" || command === "reject" || command === "search" || command === "add-dir") {
    return [];
  }
  return [];
}
