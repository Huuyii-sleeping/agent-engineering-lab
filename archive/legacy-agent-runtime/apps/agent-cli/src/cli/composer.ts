export type CliComposePreview = {
  lineCount: number;
  charCount: number;
  content: string;
};

export type CliComposePopResult = {
  removedLineCount: number;
  lineCount: number;
  charCount: number;
  content: string;
};

function keyForSession(sessionId: string | null): string {
  return sessionId?.trim() || "__shell__";
}

export class CliComposerStore {
  private readonly drafts = new Map<string, string[]>();

  isActive(sessionId: string | null): boolean {
    return this.drafts.has(keyForSession(sessionId));
  }

  start(sessionId: string | null): { lineCount: number; charCount: number } {
    const key = keyForSession(sessionId);
    const lines = this.drafts.get(key) ?? [];
    this.drafts.set(key, lines);
    return {
      lineCount: lines.length,
      charCount: lines.join("\n").length,
    };
  }

  append(sessionId: string | null, line: string): { lineCount: number; charCount: number } {
    const key = keyForSession(sessionId);
    const lines = [...(this.drafts.get(key) ?? [])];
    lines.push(line);
    this.drafts.set(key, lines);
    return {
      lineCount: lines.length,
      charCount: lines.join("\n").length,
    };
  }

  preview(sessionId: string | null): CliComposePreview | null {
    const lines = this.drafts.get(keyForSession(sessionId));
    if (!lines) {
      return null;
    }
    return {
      lineCount: lines.length,
      charCount: lines.join("\n").length,
      content: lines.join("\n"),
    };
  }

  pop(sessionId: string | null, count = 1): CliComposePopResult | null {
    const key = keyForSession(sessionId);
    const lines = this.drafts.get(key);
    if (!lines) {
      return null;
    }
    const nextLines = [...lines];
    const removeCount = Math.max(0, Math.min(Math.trunc(count), nextLines.length));
    if (removeCount > 0) {
      nextLines.splice(nextLines.length - removeCount, removeCount);
    }
    this.drafts.set(key, nextLines);
    const content = nextLines.join("\n");
    return {
      removedLineCount: removeCount,
      lineCount: nextLines.length,
      charCount: content.length,
      content,
    };
  }

  consume(sessionId: string | null): CliComposePreview | null {
    const key = keyForSession(sessionId);
    const preview = this.preview(sessionId);
    if (!preview) {
      return null;
    }
    this.drafts.delete(key);
    return preview;
  }

  cancel(sessionId: string | null): CliComposePreview | null {
    return this.consume(sessionId);
  }

  lineCount(sessionId: string | null): number {
    return this.preview(sessionId)?.lineCount ?? 0;
  }

  clearSession(sessionId: string | null): void {
    this.drafts.delete(keyForSession(sessionId));
  }
}
