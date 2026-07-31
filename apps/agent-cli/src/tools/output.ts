export type ToolOutputAnalysis = {
  ok: boolean;
  errorCode: string | null;
  summary: string;
};

function summarizeText(value: string, max = 220): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}...`;
}

/** 将 Tool 的稳定 JSON/文本输出归一化为 CLI 展示摘要。 */
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
