import type { ServerResponse } from "node:http";

/** 写入 Orbit 兼容的 JSON HTTP 响应。 */
export function writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

/** 写入 Orbit 兼容的 SSE 事件。 */
export function writeSseEvent(
  res: ServerResponse,
  input: { event: string; data: unknown; id?: number },
): void {
  if (typeof input.id === "number") res.write(`id: ${input.id}\n`);
  res.write(`event: ${input.event}\n`);
  res.write(`data: ${JSON.stringify(input.data)}\n\n`);
}

/** 将可选查询参数解析为正整数限制。 */
export function parsePositiveLimit(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** 将 SSE cursor 解析为整数；空值表示从当前窗口开始。 */
export function parseOptionalEventCursor(raw: string | undefined): number | null | undefined {
  if (raw === undefined || raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/** 将 Workflow SSE cursor 解析为非负整数。 */
export function parseWorkflowEventCursor(raw: string | undefined): number {
  const parsed = Number(raw || 0);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error("事件游标必须是非负整数。");
  return parsed;
}
