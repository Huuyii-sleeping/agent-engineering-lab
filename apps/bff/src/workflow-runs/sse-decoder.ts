import type { WorkflowRuntimeEvent } from "@orbit/workflow-core";

const workflowRunStatuses = new Set(["queued", "running", "waiting", "succeeded", "failed", "cancelled"]);
const workflowNodeStatuses = new Set(["pending", "ready", "running", "waiting", "succeeded", "failed", "skipped", "cancelled"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasEventBase(value: Record<string, unknown>): boolean {
  return Number.isInteger(value.id)
    && typeof value.runId === "string"
    && Number.isFinite(value.at);
}

function isWaitingMetadata(value: unknown): boolean {
  if (value === undefined) return true;
  return isRecord(value)
    && value.kind === "approval"
    && typeof value.interruptId === "string"
    && typeof value.approvalRequestId === "string"
    && Number.isFinite(value.deadline)
    && Array.isArray(value.displayFields)
    && value.displayFields.every((field) => (
      isRecord(field)
      && typeof field.id === "string"
      && typeof field.label === "string"
      && Object.hasOwn(field, "value")
    ))
    && isRecord(value.decisionSchema);
}

/** 增量 SSE 解码器，保留半包并只返回完整 data frame。 */
export class WorkflowSseDecoder {
  private buffer = "";

  push(chunk: string): string[] {
    this.buffer += chunk.replace(/\r\n/g, "\n");
    const frames: string[] = [];
    while (true) {
      const boundary = this.buffer.indexOf("\n\n");
      if (boundary < 0) break;
      frames.push(this.buffer.slice(0, boundary + 2));
      this.buffer = this.buffer.slice(boundary + 2);
    }
    return frames;
  }

  static event(frame: string): unknown {
    const data = frame.split("\n").filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart()).join("\n");
    return data ? JSON.parse(data) as unknown : undefined;
  }

  /** 只接受当前产品协议事件；未知新事件由 BFF 跳过但不阻断后续 frame。 */
  static runtimeEvent(frame: string): WorkflowRuntimeEvent | undefined {
    const value = WorkflowSseDecoder.event(frame);
    if (!isRecord(value) || !hasEventBase(value) || typeof value.type !== "string") return undefined;
    if (value.type === "run.status") {
      return workflowRunStatuses.has(String(value.status)) ? value as WorkflowRuntimeEvent : undefined;
    }
    if (value.type === "node.status") {
      return typeof value.nodeId === "string"
        && workflowNodeStatuses.has(String(value.status))
        && Number.isInteger(value.attempt)
        ? value as WorkflowRuntimeEvent
        : undefined;
    }
    if (value.type === "node.log") {
      return typeof value.nodeId === "string"
        && ["debug", "info", "warning", "error"].includes(String(value.level))
        && typeof value.message === "string"
        ? value as WorkflowRuntimeEvent
        : undefined;
    }
    if (value.type === "node.output") {
      return typeof value.nodeId === "string" && isRecord(value.output) ? value as WorkflowRuntimeEvent : undefined;
    }
    if (value.type === "run.output") {
      return isRecord(value.output) ? value as WorkflowRuntimeEvent : undefined;
    }
    if (value.type === "run.waiting") {
      return typeof value.nodeId === "string"
        && typeof value.reason === "string"
        && isWaitingMetadata(value.waiting)
        ? value as WorkflowRuntimeEvent
        : undefined;
    }
    return undefined;
  }
}
