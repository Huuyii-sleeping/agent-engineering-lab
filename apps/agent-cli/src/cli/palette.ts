import type { CliSessionSummary } from "./ui.js";
import type { CliWorkflowMode } from "./workflow.js";

export type CliPaletteCandidate = {
  id: string;
  group: "workflow" | "help" | "draft" | "session" | "browse" | "runtime" | "approval";
  title: string;
  summary: string;
  command: string;
  keywords: string[];
};

export type CliPaletteView = {
  query: string;
  candidates: CliPaletteCandidate[];
  total: number;
};

export type CliPaletteContext = {
  sessions: CliSessionSummary[];
  helpTopics: string[];
  composerActive: boolean;
  pendingApprovals: number;
  workflow: CliWorkflowMode;
};

type CliPaletteState = {
  query: string;
  candidates: CliPaletteCandidate[];
};

function sessionKey(sessionId: string | null): string {
  return sessionId ?? "__default__";
}

function uniqueById(candidates: CliPaletteCandidate[]): CliPaletteCandidate[] {
  const seen = new Set<string>();
  const next: CliPaletteCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) {
      continue;
    }
    seen.add(candidate.id);
    next.push(candidate);
  }
  return next;
}

export const CLI_PALETTE_GROUP_ORDER = [
  "workflow",
  "help",
  "draft",
  "session",
  "browse",
  "runtime",
  "approval",
] as const satisfies readonly CliPaletteCandidate["group"][];

export function getCliPaletteGroupLabel(group: CliPaletteCandidate["group"]): string {
  if (group === "workflow") {
    return "workflow";
  }
  if (group === "help") {
    return "help";
  }
  if (group === "draft") {
    return "draft";
  }
  if (group === "session") {
    return "session";
  }
  if (group === "browse") {
    return "browse";
  }
  if (group === "runtime") {
    return "runtime";
  }
  return "approval";
}

function staticPaletteCandidates(context: CliPaletteContext): CliPaletteCandidate[] {
  const base: CliPaletteCandidate[] = [
    {
      id: "workflow-agent",
      group: "workflow",
      title: context.workflow === "agent" ? "Agent workflow (active)" : "Switch to agent workflow",
      summary: "Use the general-purpose local agent control surface.",
      command: "/workflow agent",
      keywords: ["workflow", "agent", "mode", "surface", "general"],
    },
    {
      id: "workflow-draw",
      group: "workflow",
      title: context.workflow === "draw" ? "Draw workflow (active)" : "Switch to draw workflow",
      summary: "Use the draw-oriented local brief and launcher surface.",
      command: "/workflow draw",
      keywords: ["workflow", "draw", "image", "art", "mode", "surface"],
    },
    {
      id: "help-overview",
      group: "help",
      title: "Command guide",
      summary: "Open the top-level local help surface.",
      command: "/help",
      keywords: ["help", "guide", "commands", "manual"],
    },
    ...context.helpTopics
      .filter((topic) => topic !== "all")
      .map((topic) => ({
        id: `help-${topic}`,
        group: "help" as const,
        title: `Help topic: ${topic}`,
        summary: `Open the ${topic} help topic.`,
        command: `/help ${topic}`,
        keywords: ["help", topic, "topic", "guide"],
      })),
    {
      id: "draft-compose",
      group: "draft",
      title:
        context.workflow === "draw"
          ? context.composerActive
            ? "Resume draw brief"
            : "Start draw brief"
          : context.composerActive
            ? "Resume draft mode"
            : "Start draft mode",
      summary:
        context.workflow === "draw"
          ? "Compose a multi-line local draw brief before handing it off."
          : "Compose a multi-line local draft before sending it.",
      command: "/compose",
      keywords:
        context.workflow === "draw"
          ? ["draft", "compose", "draw", "image", "brief", "multiline"]
          : ["draft", "compose", "prompt", "multiline"],
    },
    {
      id: "draft-preview",
      group: "draft",
      title: context.workflow === "draw" ? "Preview current draw brief" : "Preview current draft",
      summary: context.workflow === "draw" ? "Inspect numbered draw brief lines and size." : "Inspect numbered draft lines and size.",
      command: "/preview",
      keywords: context.workflow === "draw" ? ["draft", "preview", "draw", "brief", "lines"] : ["draft", "preview", "lines"],
    },
    {
      id: "draft-send",
      group: "draft",
      title: context.workflow === "draw" ? "Send current draw brief" : "Send current draft",
      summary:
        context.workflow === "draw"
          ? "Submit the local draw brief through the current prompt path."
          : "Submit the local draft into the model request path.",
      command: "/send",
      keywords: context.workflow === "draw" ? ["draft", "send", "submit", "draw", "brief"] : ["draft", "send", "submit"],
    },
    {
      id: "session-list",
      group: "session",
      title: "List local sessions",
      summary: "Inspect session indexes and statuses.",
      command: "/sessions",
      keywords: ["sessions", "list", "local", "chat"],
    },
    {
      id: "session-next",
      group: "session",
      title: "Next session",
      summary: "Move to the next session in local order.",
      command: "/next",
      keywords: ["session", "next", "switch", "forward"],
    },
    {
      id: "session-prev",
      group: "session",
      title: "Previous session",
      summary: "Move to the previous session in local order.",
      command: "/prev",
      keywords: ["session", "prev", "previous", "switch", "back"],
    },
    {
      id: "browse-history",
      group: "browse",
      title: "Browse transcript window",
      summary: "Inspect the current transcript window.",
      command: "/history",
      keywords: ["history", "transcript", "browse", "window"],
    },
    {
      id: "browse-tail",
      group: "browse",
      title: "Return to transcript tail",
      summary: "Switch back to the live tail transcript view.",
      command: "/tail",
      keywords: ["tail", "transcript", "live", "recent"],
    },
    {
      id: "runtime-status",
      group: "runtime",
      title: "Show runtime status",
      summary: "Inspect model, session, usage, permissions, and roots.",
      command: "/status",
      keywords: ["runtime", "status", "model", "usage"],
    },
    {
      id: "runtime-model",
      group: "runtime",
      title: "Inspect or switch model",
      summary: "Use the local model control surface.",
      command: "/model",
      keywords: ["model", "runtime", "switch"],
    },
    {
      id: "runtime-permissions",
      group: "runtime",
      title: "Inspect or change permission mode",
      summary: "Review the current local permission mode.",
      command: "/permissions",
      keywords: ["permissions", "approvals", "mode", "runtime"],
    },
    {
      id: "runtime-architecture",
      group: "runtime",
      title: "Inspect runtime architecture coverage",
      summary: "Compare the local runtime layers against the external architecture overview.",
      command: "/architecture",
      keywords: ["architecture", "overview", "runtime", "layers", "claude", "compare"],
    },
    {
      id: "runtime-data-governance",
      group: "runtime",
      title: "Inspect user data governance",
      summary: "Review what enters the model, what stays local, and which data planes are still reserved gaps.",
      command: "/data",
      keywords: ["data", "privacy", "governance", "telemetry", "memory", "bridge"],
    },
    {
      id: "runtime-skills",
      group: "runtime",
      title: "List discovered skills",
      summary: "Inspect the local skill catalog and prompt-loaded skills.",
      command: "/skills",
      keywords: ["skills", "skill", "runtime", "catalog", "prompt"],
    },
    {
      id: "runtime-prompt",
      group: "runtime",
      title: "Dump current system prompt",
      summary: "Inspect the current stable prompt pipeline output without using the model.",
      command: "/prompt",
      keywords: ["prompt", "system", "runtime", "inspect", "dump"],
    },
    {
      id: "runtime-cost",
      group: "runtime",
      title: "Inspect usage and cost",
      summary: "Show token and local cost summary.",
      command: "/cost",
      keywords: ["cost", "usage", "tokens", "runtime"],
    },
    {
      id: "runtime-doctor",
      group: "runtime",
      title: "Run local diagnostics",
      summary: "Check model, workspace, hooks, and local readiness.",
      command: "/doctor",
      keywords: ["doctor", "diagnostics", "runtime", "health"],
    },
    {
      id: "approval-list",
      group: "approval",
      title: "List approval requests",
      summary: context.pendingApprovals > 0 ? `${context.pendingApprovals} approval(s) pending.` : "Inspect current approval queue.",
      command: "/approvals",
      keywords: ["approvals", "approval", "queue", "security"],
    },
  ];
  return base;
}

function dynamicSessionCandidates(context: CliPaletteContext): CliPaletteCandidate[] {
  if (context.sessions.length === 0) {
    return [];
  }
  const sessionCandidates = context.sessions.map((session, index) => ({
    id: `session-${session.id}`,
    group: "session" as const,
    title: `Switch to session [${index + 1}] ${session.id}`,
    summary: `${session.messageCount} message(s) / ${session.busy ? "busy" : "idle"}${session.active ? " / active" : ""}`,
    command: `/use ${index + 1}`,
    keywords: ["session", session.id, String(index + 1), session.active ? "active" : "idle", "switch"],
  }));
  return [
    {
      id: "session-latest",
      group: "session",
      title: "Switch to latest session",
      summary: "Jump to the newest local session.",
      command: "/use latest",
      keywords: ["session", "latest", "recent", "newest"],
    },
    ...sessionCandidates,
  ];
}

function candidateRank(candidate: CliPaletteCandidate): number {
  if (candidate.group === "workflow") {
    return 5;
  }
  if (candidate.group === "help") {
    return 10;
  }
  if (candidate.group === "session") {
    return 20;
  }
  if (candidate.group === "draft") {
    return 30;
  }
  if (candidate.group === "browse") {
    return 40;
  }
  if (candidate.group === "runtime") {
    return 50;
  }
  return 60;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWordMatch(haystack: string, needle: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}($|[^a-z0-9])`, "i").test(haystack);
}

function fuzzyScore(candidate: CliPaletteCandidate, query: string): number {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return 1000 - candidateRank(candidate);
  }
  const haystacks = [
    candidate.title.toLowerCase(),
    candidate.summary.toLowerCase(),
    candidate.command.toLowerCase(),
    candidate.keywords.join(" ").toLowerCase(),
  ];
  let score = 0;
  for (const haystack of haystacks) {
    if (haystack === normalized) {
      score += 300;
    }
    if (haystack.startsWith(normalized)) {
      score += 180;
    }
    if (hasWordMatch(haystack, normalized)) {
      score += 140;
    } else if (haystack.includes(normalized)) {
      score += 90;
    }
  }
  const tokens = normalized.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (hasWordMatch(candidate.command.toLowerCase(), token)) {
      score += 50;
    } else if (candidate.command.toLowerCase().includes(token)) {
      score += 30;
    }
    if (hasWordMatch(candidate.title.toLowerCase(), token)) {
      score += 70;
    } else if (candidate.title.toLowerCase().includes(token)) {
      score += 40;
    }
    if (hasWordMatch(candidate.summary.toLowerCase(), token)) {
      score += 45;
    } else if (candidate.summary.toLowerCase().includes(token)) {
      score += 20;
    }
    if (candidate.keywords.some((keyword) => hasWordMatch(keyword.toLowerCase(), token))) {
      score += 55;
    } else if (candidate.keywords.some((keyword) => keyword.toLowerCase().includes(token))) {
      score += 25;
    }
  }
  return score;
}

export function buildCliPaletteCandidates(context: CliPaletteContext): CliPaletteCandidate[] {
  return uniqueById([
    ...dynamicSessionCandidates(context),
    ...staticPaletteCandidates(context),
  ]);
}

export function searchCliPaletteCandidates(
  context: CliPaletteContext,
  query = "",
  limit = 8,
): CliPaletteView {
  const candidates = buildCliPaletteCandidates(context)
    .map((candidate) => ({
      candidate,
      score: fuzzyScore(candidate, query),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (candidateRank(left.candidate) !== candidateRank(right.candidate)) {
        return candidateRank(left.candidate) - candidateRank(right.candidate);
      }
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.candidate.title.localeCompare(right.candidate.title);
    });
  return {
    query: query.trim(),
    candidates: candidates.slice(0, limit).map((entry) => entry.candidate),
    total: candidates.length,
  };
}

export class CliPaletteStore {
  private readonly states = new Map<string, CliPaletteState>();

  search(sessionId: string | null, context: CliPaletteContext, query = ""): CliPaletteView {
    const view = searchCliPaletteCandidates(context, query);
    this.states.set(sessionKey(sessionId), {
      query: view.query,
      candidates: view.candidates,
    });
    return view;
  }

  open(sessionId: string | null, index: number): CliPaletteCandidate | null {
    const state = this.states.get(sessionKey(sessionId));
    if (!state) {
      return null;
    }
    return state.candidates[index - 1] ?? null;
  }

  lastCount(sessionId: string | null): number {
    return this.states.get(sessionKey(sessionId))?.candidates.length ?? 0;
  }
}
