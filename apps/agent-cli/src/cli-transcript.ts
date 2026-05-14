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
    }
  | {
      mode: "peek";
      total: number;
      entry: CliTranscriptEntry;
    };

type CliTranscriptBrowserState =
  | { mode: "tail" }
  | { mode: "history"; start: number }
  | { mode: "search"; query: string }
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

  history(sessionId: string | null, messages: unknown[], direction: "current" | "next" | "prev" = "current"): CliTranscriptView {
    const key = sessionKey(sessionId);
    const entries = createCliTranscriptEntries(messages);
    const previous = this.states.get(key);
    let start =
      previous?.mode === "history"
        ? previous.start
        : Math.max(0, entries.length - this.pageSize);
    if (direction === "next") {
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
    const normalizedQuery = query.trim().toLowerCase();
    const matches = entries.filter((entry) => entry.content.toLowerCase().includes(normalizedQuery));
    this.states.set(sessionKey(sessionId), { mode: "search", query: query.trim() });
    return {
      mode: "search",
      query: query.trim(),
      total: entries.length,
      matches,
    };
  }

  peek(sessionId: string | null, messages: unknown[], entryIndex: number): CliTranscriptView | null {
    const entries = createCliTranscriptEntries(messages);
    const entry = entries.find((item) => item.index === entryIndex);
    if (!entry) {
      return null;
    }
    this.states.set(sessionKey(sessionId), { mode: "peek", index: entryIndex });
    return {
      mode: "peek",
      total: entries.length,
      entry,
    };
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
      return {
        mode: "search",
        query: state.query,
        total: entries.length,
        matches: entries.filter((entry) => entry.content.toLowerCase().includes(state.query.toLowerCase())),
      };
    }
    const entry = entries.find((item) => item.index === state.index);
    if (!entry) {
      return buildWindowView(entries, "tail", Math.max(0, entries.length - this.pageSize), this.pageSize);
    }
    return {
      mode: "peek",
      total: entries.length,
      entry,
    };
  }
}
