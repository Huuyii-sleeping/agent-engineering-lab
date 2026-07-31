import type { IncomingMessage, ServerResponse } from "node:http";
import { isTerminalWorkflowRunStatus, type WorkflowRuntimeEvent } from "@orbit/workflow-core";
import type { StartWorkflowRequest, WorkflowRuntimeService } from "./service.js";

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function parseBody(req: IncomingMessage): Promise<StartWorkflowRequest> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    req.on("error", reject);
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as StartWorkflowRequest);
      } catch (error) {
        reject(new Error(`请求 JSON 无效：${error instanceof Error ? error.message : String(error)}`));
      }
    });
  });
}

function parseCursor(url: URL, req: IncomingMessage): number {
  const rawHeader = req.headers["last-event-id"];
  const raw = typeof rawHeader === "string" ? rawHeader : url.searchParams.get("since_id") ?? "0";
  const cursor = Number(raw || 0);
  if (!Number.isInteger(cursor) || cursor < 0) throw new Error("事件游标必须是非负整数。");
  return cursor;
}

function writeEvent(res: ServerResponse, event: WorkflowRuntimeEvent): void {
  res.write(`id: ${event.id}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function runIdFrom(pathname: string, suffix = ""): string | null {
  const expression = suffix
    ? new RegExp(`^/workflow-runs/([^/]+)/${suffix}$`)
    : /^\/workflow-runs\/([^/]+)$/;
  const matched = pathname.match(expression);
  return matched ? decodeURIComponent(matched[1]) : null;
}

/** 独立处理 workflow runtime HTTP API；返回 false 表示请求不属于该领域。 */
export async function handleWorkflowHttpRequest(
  service: WorkflowRuntimeService,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const method = req.method ?? "GET";
  const pathname = url.pathname;

  if (method === "POST" && pathname === "/workflow-runs") {
    try {
      const run = service.start(await parseBody(req));
      json(res, 201, { ok: true, run });
    } catch (error) {
      json(res, 400, { ok: false, error: { code: "WORKFLOW_RUN_INVALID", message: error instanceof Error ? error.message : String(error) } });
    }
    return true;
  }

  const detailRunId = runIdFrom(pathname);
  if (method === "GET" && detailRunId) {
    const run = service.get(detailRunId);
    json(res, run ? 200 : 404, run
      ? { ok: true, run }
      : { ok: false, error: { code: "WORKFLOW_RUN_NOT_FOUND", message: `运行 ${detailRunId} 不存在。` } });
    return true;
  }

  const cancelRunId = runIdFrom(pathname, "cancel");
  if (method === "POST" && cancelRunId) {
    const run = service.get(cancelRunId);
    if (!run) {
      json(res, 404, { ok: false, error: { code: "WORKFLOW_RUN_NOT_FOUND", message: `运行 ${cancelRunId} 不存在。` } });
    } else if (isTerminalWorkflowRunStatus(run.status)) {
      json(res, 409, { ok: false, error: { code: "WORKFLOW_RUN_TERMINAL", message: `运行已进入终态 ${run.status}。` }, run });
    } else {
      service.cancel(cancelRunId);
      json(res, 202, { ok: true, run });
    }
    return true;
  }

  const eventsRunId = runIdFrom(pathname, "events");
  if (method === "GET" && eventsRunId) {
    const run = service.get(eventsRunId);
    if (!run) {
      json(res, 404, { ok: false, error: { code: "WORKFLOW_RUN_NOT_FOUND", message: `运行 ${eventsRunId} 不存在。` } });
      return true;
    }
    let cursor: number;
    try {
      cursor = parseCursor(url, req);
    } catch (error) {
      json(res, 400, { ok: false, error: { code: "INVALID_CURSOR", message: error instanceof Error ? error.message : String(error) } });
      return true;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    for (const event of service.events(eventsRunId, cursor)) writeEvent(res, event);
    if (isTerminalWorkflowRunStatus(run.status)) {
      res.end();
      return true;
    }
    const unsubscribe = service.subscribe(eventsRunId, (event) => {
      writeEvent(res, event);
      if (event.type === "run.status" && isTerminalWorkflowRunStatus(event.status)) {
        unsubscribe();
        res.end();
      }
    });
    req.on("close", unsubscribe);
    return true;
  }

  return false;
}
