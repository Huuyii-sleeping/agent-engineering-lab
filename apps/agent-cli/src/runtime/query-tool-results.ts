import type { AgentRuntimeState } from "../agent-loop.js";

export type ToolOutputAnalysis = {
  ok: boolean;
  errorCode: string | null;
  summary: string;
};

function summarizeText(value: string, max = 220): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max)}...`;
}

export function analyzeToolOutput(output: string): ToolOutputAnalysis {
  try {
    const parsed = JSON.parse(output) as { ok?: boolean; error?: { code?: unknown } };
    return {
      ok: parsed.ok !== false,
      errorCode: parsed.ok === false ? String(parsed.error?.code ?? "UNKNOWN_ERROR") : null,
      summary: summarizeText(output),
    };
  } catch {
    return { ok: true, errorCode: null, summary: summarizeText(output) };
  }
}

export function parseTaskIdFromToolOutput(output: string): number | null {
  try {
    const parsed = JSON.parse(output) as { id?: unknown; error?: unknown };
    if (parsed && !parsed.error) {
      const id = Number(parsed.id);
      if (Number.isInteger(id) && id > 0) {
        return id;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function markWriteSideEffect(
  runtimeState: AgentRuntimeState,
  toolName: string,
  args: Record<string, unknown>,
): void {
  if (toolName !== "write_file" && toolName !== "edit_file") {
    return;
  }
  const target = typeof args.path === "string" ? args.path.trim() : "";
  runtimeState.wroteWorkspaceFiles = true;
  if (target) {
    runtimeState.touchedPaths.add(target);
  }
}

export function isTodoCompletionRequest(args: Record<string, unknown>): boolean {
  const items = args.items;
  if (!Array.isArray(items) || items.length === 0) {
    return false;
  }
  return items.every((item) => {
    if (typeof item !== "object" || item === null) {
      return false;
    }
    const status = String((item as Record<string, unknown>).status ?? "").toLowerCase();
    return status === "completed";
  });
}
