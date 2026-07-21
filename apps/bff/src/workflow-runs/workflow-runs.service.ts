import { Inject, Injectable } from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WorkflowRunMode, WorkflowRuntimeEvent } from "@orbit/workflow-core";
import { AgentProxyService, type ProxyResult } from "../agent-proxy.service.js";
import { applyCommonHeaders, writeJson } from "../http-utils.js";
import { SqliteSopsRepository } from "../sops/sqlite-sops.repository.js";
import { WorkflowRunControlError } from "./workflow-runs.errors.js";
import { WorkflowSseDecoder } from "./sse-decoder.js";
import { SqliteWorkflowRunsRepository } from "./sqlite-workflow-runs.repository.js";
import type { StartWorkflowRunInput, WorkflowRunSnapshot } from "./workflow-runs.types.js";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requireMode(value: unknown): WorkflowRunMode {
  if (value === "node-test" || value === "draft" || value === "production") return value;
  throw new WorkflowRunControlError(400, "WORKFLOW_RUN_INVALID", "mode 必须是 node-test、draft 或 production。");
}

function upstreamError(result: ProxyResult): WorkflowRunControlError {
  const body = asObject(result.body);
  const error = asObject(body.error);
  return new WorkflowRunControlError(
    result.status,
    String(error.code ?? "WORKFLOW_AGENT_ERROR"),
    String(error.message ?? "Agent workflow runtime 请求失败。"),
  );
}

function runFrom(result: ProxyResult): WorkflowRunSnapshot {
  if (!result.ok) throw upstreamError(result);
  const body = asObject(result.body);
  if (body.ok === false) throw upstreamError(result);
  const run = asObject(body.run);
  if (!run.id || !run.workflowId || !run.status || !run.mode || !run.nodeRuns) {
    throw new WorkflowRunControlError(502, "WORKFLOW_AGENT_RESPONSE_INVALID", "Agent 返回的运行快照不完整。");
  }
  return run as WorkflowRunSnapshot;
}

/** workflow-runs 控制面：解析权威版本、代理 Agent、建立运行索引并转发 SSE。 */
@Injectable()
export class WorkflowRunsService {
  constructor(
    @Inject(AgentProxyService) private readonly agent: AgentProxyService,
    @Inject(SqliteSopsRepository) private readonly sops: SqliteSopsRepository,
    @Inject(SqliteWorkflowRunsRepository) private readonly runs: SqliteWorkflowRunsRepository,
  ) {}

  /** 按草稿或发布版本启动运行；客户端不能直接提交生产快照。 */
  async start(input: StartWorkflowRunInput): Promise<WorkflowRunSnapshot> {
    const workflowId = String(input?.workflowId ?? "").trim();
    if (!workflowId) throw new WorkflowRunControlError(400, "WORKFLOW_RUN_INVALID", "workflowId 不能为空。");
    const mode = requireMode(input.mode);
    if (mode === "node-test" && !String(input.targetNodeId ?? "").trim()) {
      throw new WorkflowRunControlError(400, "WORKFLOW_RUN_INVALID", "单节点试运行必须指定 targetNodeId。");
    }
    const workflow = mode === "production"
      ? this.requireVersion(workflowId, input.versionId)
      : this.requireDraft(workflowId);
    const result = await this.agent.startWorkflowRun({
      workflow,
      mode,
      inputs: asObject(input.inputs),
      target_node_id: input.targetNodeId,
      node_inputs: asObject(input.nodeInputs),
    });
    const run = runFrom(result);
    this.runs.saveRun(run);
    return run;
  }

  /** 查询 Agent 最新快照并同步本地索引。 */
  async get(runId: string): Promise<WorkflowRunSnapshot> {
    const run = runFrom(await this.agent.workflowRun(runId));
    this.runs.saveRun(run);
    return run;
  }

  /** 取消请求由 Agent 传播到 executor AbortSignal。 */
  async cancel(runId: string): Promise<WorkflowRunSnapshot> {
    const run = runFrom(await this.agent.cancelWorkflowRun(runId));
    this.runs.saveRun(run);
    return run;
  }

  /** 原样转发 Agent SSE，同时按事件 id 幂等落库。 */
  async stream(runId: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestUrl = new URL(req.url ?? "", "http://127.0.0.1");
    const lastEventId = typeof req.headers["last-event-id"] === "string" ? req.headers["last-event-id"] : undefined;
    const controller = new AbortController();
    let completed = false;
    res.on("close", () => { if (!completed) controller.abort(); });
    try {
      const upstream = await this.agent.workflowEventStream(runId, requestUrl.search, lastEventId, controller.signal);
      if (!upstream.ok) {
        const raw = await upstream.text();
        writeJson(res, upstream.status, raw.trim() ? JSON.parse(raw) as unknown : { ok: false });
        return;
      }
      applyCommonHeaders(res);
      res.statusCode = upstream.status;
      res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      if (!upstream.body) {
        completed = true;
        res.end();
        return;
      }
      const reader = upstream.body.getReader();
      const text = new TextDecoder();
      const decoder = new WorkflowSseDecoder();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          for (const frame of decoder.push(text.decode(chunk.value, { stream: true }))) {
            this.persistFrame(frame);
            if (!res.write(frame)) await new Promise<void>((resolve) => res.once("drain", resolve));
          }
        }
        for (const frame of decoder.push(text.decode())) {
          this.persistFrame(frame);
          res.write(frame);
        }
      } finally {
        reader.releaseLock();
      }
      completed = true;
      res.end();
    } catch (error) {
      if (controller.signal.aborted || res.headersSent) {
        res.end();
        return;
      }
      throw new WorkflowRunControlError(502, "WORKFLOW_AGENT_UNAVAILABLE", error instanceof Error ? error.message : String(error));
    }
  }

  /** 测试和后续运行历史页面可读取已持久化索引。 */
  persisted(runId: string): WorkflowRunSnapshot | null {
    return this.runs.getRun(runId);
  }

  private requireDraft(workflowId: string) {
    const draft = this.sops.getDraft(workflowId);
    if (!draft) throw new WorkflowRunControlError(404, "SOP_NOT_FOUND", `草稿 ${workflowId} 不存在。`);
    return draft;
  }

  private requireVersion(workflowId: string, versionId: string | undefined) {
    if (!versionId) throw new WorkflowRunControlError(400, "WORKFLOW_RUN_INVALID", "production 运行必须指定 versionId。");
    const version = this.sops.getVersion(workflowId, versionId);
    if (!version) throw new WorkflowRunControlError(404, "SOP_VERSION_NOT_FOUND", `版本 ${versionId} 不存在。`);
    return version;
  }

  private persistFrame(frame: string): void {
    const value = WorkflowSseDecoder.event(frame);
    if (!value || typeof value !== "object") return;
    const event = value as WorkflowRuntimeEvent;
    if (typeof event.id === "number" && typeof event.runId === "string" && typeof event.type === "string") {
      this.runs.saveEvent(event);
    }
  }
}
