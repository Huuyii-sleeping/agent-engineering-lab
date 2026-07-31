import { describe, expect, it } from "vitest";
import { WorkflowSseDecoder } from "../../../src/workflow-runs/sse-decoder.js";

describe("WorkflowSseDecoder", () => {
  it("跨网络分片保留完整事件 frame", () => {
    const decoder = new WorkflowSseDecoder();
    expect(decoder.push("id: 1\nevent: run.status\nda")).toEqual([]);
    const frames = decoder.push("ta: {\"id\":1,\"runId\":\"run-1\",\"type\":\"run.status\"}\n\n");
    expect(frames).toHaveLength(1);
    expect(WorkflowSseDecoder.event(frames[0])).toMatchObject({ id: 1, runId: "run-1", type: "run.status" });
  });

  it("跳过未知事件但继续解析后续旧协议事件", () => {
    const decoder = new WorkflowSseDecoder();
    const frames = decoder.push([
      'id: 1\nevent: future.event\ndata: {"id":1,"runId":"run-1","at":1,"type":"future.event"}\n\n',
      'id: 2\nevent: run.status\ndata: {"id":2,"runId":"run-1","at":2,"type":"run.status","status":"running"}\n\n',
    ].join(""));
    expect(WorkflowSseDecoder.runtimeEvent(frames[0]!)).toBeUndefined();
    expect(WorkflowSseDecoder.runtimeEvent(frames[1]!)).toMatchObject({ id: 2, type: "run.status", status: "running" });
  });

  it("拒绝缺少既有事件必填字段的畸形 frame", () => {
    expect(WorkflowSseDecoder.runtimeEvent(
      'data: {"id":1,"runId":"run-1","at":1,"type":"node.status","nodeId":"node-1","status":"running"}\n\n',
    )).toBeUndefined();
    expect(WorkflowSseDecoder.runtimeEvent(
      'data: {"id":2,"runId":"run-1","at":2,"type":"run.waiting","nodeId":"approval","reason":"waiting","waiting":{"kind":"approval","interruptId":"interrupt-1","approvalRequestId":"interrupt-1"}}\n\n',
    )).toBeUndefined();
  });

  it("只接受包含脱敏展示字段和决定 schema 的审批 waiting 投影", () => {
    const frame = 'data: {"id":3,"runId":"run-1","at":3,"type":"run.waiting","nodeId":"approval","reason":"waiting","waiting":{"kind":"approval","interruptId":"interrupt-1","approvalRequestId":"interrupt-1","deadline":100,"displayFields":[{"id":"summary","label":"摘要","value":"已脱敏"}],"decisionSchema":{"type":"object"}}}\n\n';

    expect(WorkflowSseDecoder.runtimeEvent(frame)).toMatchObject({
      type: "run.waiting",
      waiting: {
        interruptId: "interrupt-1",
        approvalRequestId: "interrupt-1",
        displayFields: [{ id: "summary", label: "摘要", value: "已脱敏" }],
        decisionSchema: { type: "object" },
      },
    });
  });
});
