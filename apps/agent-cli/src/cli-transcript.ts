export type CliTranscriptEntry = {
  index: number;
  role: string;
  content: string;
  preview: string;
  lineCount: number;
  charCount: number;
};

export type CliTranscriptView =
  | {
      mode: "tail" | "history";
      entries: CliTranscriptEntry[];
      total: number;
      start: number;
      end: number;
      hasPrev: boolean;
      hasNext: boolean;
    }
  | {
      mode: "search";
      query: string;
      total: number;
      matches: CliTranscriptEntry[];
      selectedIndex: number;
      selectedEntry: CliTranscriptEntry | null;
      hasPrevMatch: boolean;
      hasNextMatch: boolean;
    }
  | {
      mode: "peek";
      total: number;
      entry: CliTranscriptEntry;
      hasPrev: boolean;
      hasNext: boolean;
    };

type CliTranscriptSearchView = Extract<CliTranscriptView, { mode: "search" }>;
type CliTranscriptPeekView = Extract<CliTranscriptView, { mode: "peek" }>;

type CliTranscriptBrowserState =
  | { mode: "tail" }
  | { mode: "history"; start: number }
  | { mode: "search"; query: string; selectedIndex: number }
  | { mode: "peek"; index: number };

function sessionKey(sessionId: string | null): string {
  return sessionId ?? "__default__";
}

function flattenContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object") {
          const record = item as { text?: unknown; content?: unknown; input_text?: unknown; output_text?: unknown };
          if (typeof record.text === "string") {
            return record.text;
          }
          if (typeof record.content === "string") {
            return record.content;
          }
          if (typeof record.input_text === "string") {
            return record.input_text;
          }
          if (typeof record.output_text === "string") {
            return record.output_text;
          }
        }
        return JSON.stringify(item ?? "");
      })
      .join("\n");
  }
  if (content == null) {
    return "";
  }
  if (typeof content === "object") {
    return JSON.stringify(content, null, 2);
  }
  return String(content);
}

function summarizePreview(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized || "(empty)";
}

function clampStart(start: number, total: number, pageSize: number): number {
  if (total <= pageSize) {
    return 0;
  }
  const maxStart = Math.max(0, total - pageSize);
  return Math.min(Math.max(0, start), maxStart);
}

function buildWindowView(
  entries: CliTranscriptEntry[],
  mode: "tail" | "history",
  start: number,
  pageSize: number,
): CliTranscriptView {
  if (entries.length === 0) {
    return {
      mode,
      entries: [],
      total: 0,
      start: 0,
      end: 0,
      hasPrev: false,
      hasNext: false,
    };
  }
  const safeStart = clampStart(start, entries.length, pageSize);
  const safeEnd = Math.min(entries.length, safeStart + pageSize);
  return {
    mode,
    entries: entries.slice(safeStart, safeEnd),
    total: entries.length,
    start: safeStart + 1,
    end: safeEnd,
    hasPrev: safeStart > 0,
    hasNext: safeEnd < entries.length,
  };
}

function clampSelectedIndex(index: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(index, total - 1));
}

function buildSearchView(entries: CliTranscriptEntry[], query: string, selectedIndex: number): CliTranscriptSearchView {
  const matches = entries.filter((entry) => entry.content.toLowerCase().includes(query.toLowerCase()));
  const safeSelectedIndex = clampSelectedIndex(selectedIndex, matches.length);
  return {
    mode: "search",
    query,
    total: entries.length,
    matches,
    selectedIndex: safeSelectedIndex,
    selectedEntry: matches[safeSelectedIndex] ?? null,
    hasPrevMatch: matches.length > 0 && safeSelectedIndex > 0,
    hasNextMatch: matches.length > 0 && safeSelectedIndex < matches.length - 1,
  };
}

function buildPeekView(entries: CliTranscriptEntry[], entry: CliTranscriptEntry): CliTranscriptPeekView {
  return {
    mode: "peek",
    total: entries.length,
    entry,
    hasPrev: entry.index > 1,
    hasNext: entry.index < entries.length,
  };
}

export function createCliTranscriptEntries(messages: unknown[]): CliTranscriptEntry[] {
  return messages.map((message, index) => {
    const record = message && typeof message === "object" ? (message as { role?: unknown; content?: unknown }) : {};
    const role = String(record.role ?? "system");
    const content = flattenContent(record.content);
    return {
      index: index + 1,
      role,
      content,
      preview: summarizePreview(content),
      lineCount: content ? content.split("\n").length : 0,
      charCount: content.length,
    };
  });
}

export class CliTranscriptBrowserStore {
  private readonly states = new Map<string, CliTranscriptBrowserState>();

  constructor(private readonly pageSize = 8) {}

  tail(sessionId: string | null, messages: unknown[]): CliTranscriptView {
    this.states.set(sessionKey(sessionId), { mode: "tail" });
    const entries = createCliTranscriptEntries(messages);
    return buildWindowView(entries, "tail", Math.max(0, entries.length - this.pageSize), this.pageSize);
  }

  history(
    sessionId: string | null,
    messages: unknown[],
    direction: "current" | "next" | "prev" | "first" | "last" = "current",
  ): CliTranscriptView {
    const key = sessionKey(sessionId);
    const entries = createCliTranscriptEntries(messages);
    const previous = this.states.get(key);
    let start =
      previous?.mode === "history"
        ? previous.start
        : Math.max(0, entries.length - this.pageSize);
    if (direction === "first") {
      start = 0;
    } else if (direction === "last") {
      start = Math.max(0, entries.length - this.pageSize);
    } else if (direction === "next") {
      start += this.pageSize;
    } else if (direction === "prev") {
      start -= this.pageSize;
    }
    start = clampStart(start, entries.length, this.pageSize);
    this.states.set(key, { mode: "history", start });
    return buildWindowView(entries, "history", start, this.pageSize);
  }

  search(sessionId: string | null, messages: unknown[], query: string): CliTranscriptView {
    const entries = createCliTranscriptEntries(messages);
    const normalizedQuery = query.trim();
    this.states.set(sessionKey(sessionId), { mode: "search", query: normalizedQuery, selectedIndex: 0 });
    return buildSearchView(entries, normalizedQuery, 0);
  }

  moveSearch(sessionId: string | null, messages: unknown[], direction: "next" | "prev"): CliTranscriptView | null {
    const key = sessionKey(sessionId);
    const previous = this.states.get(key);
    if (!previous || previous.mode !== "search") {
      return null;
    }
    const entries = createCliTranscriptEntries(messages);
    const current = buildSearchView(entries, previous.query, previous.selectedIndex);
    const delta = direction === "next" ? 1 : -1;
    const nextSelectedIndex = clampSelectedIndex(current.selectedIndex + delta, current.matches.length);
    this.states.set(key, { mode: "search", query: previous.query, selectedIndex: nextSelectedIndex });
    return buildSearchView(entries, previous.query, nextSelectedIndex);
  }

  peek(sessionId: string | null, messages: unknown[], entryIndex: number): CliTranscriptView | null {
    const entries = createCliTranscriptEntries(messages);
    const entry = entries.find((item) => item.index === entryIndex);
    if (!entry) {
      return null;
    }
    this.states.set(sessionKey(sessionId), { mode: "peek", index: entryIndex });
    return buildPeekView(entries, entry);
  }

  peekRelative(sessionId: string | null, messages: unknown[], direction: "next" | "prev"): CliTranscriptView | null {
    const key = sessionKey(sessionId);
    const previous = this.states.get(key);
    if (!previous || previous.mode !== "peek") {
      return null;
    }
    const entries = createCliTranscriptEntries(messages);
    const currentPosition = entries.findIndex((entry) => entry.index === previous.index);
    if (currentPosition < 0) {
      return null;
    }
    const delta = direction === "next" ? 1 : -1;
    const nextPosition = Math.max(0, Math.min(currentPosition + delta, entries.length - 1));
    const entry = entries[nextPosition];
    if (!entry) {
      return null;
    }
    this.states.set(key, { mode: "peek", index: entry.index });
    return buildPeekView(entries, entry);
  }

  getView(sessionId: string | null, messages: unknown[]): CliTranscriptView {
    const entries = createCliTranscriptEntries(messages);
    const state = this.states.get(sessionKey(sessionId));
    if (!state || state.mode === "tail") {
      return buildWindowView(entries, "tail", Math.max(0, entries.length - this.pageSize), this.pageSize);
    }
    if (state.mode === "history") {
      return buildWindowView(entries, "history", state.start, this.pageSize);
    }
    if (state.mode === "search") {
      return buildSearchView(entries, state.query, state.selectedIndex);
    }
    const entry = entries.find((item) => item.index === state.index);
    if (!entry) {
      return buildWindowView(entries, "tail", Math.max(0, entries.length - this.pageSize), this.pageSize);
    }
    return buildPeekView(entries, entry);
  }
}
