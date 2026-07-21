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
});
