import { describe, expect, it } from "vitest";
import { WorkflowEventStream } from "../../../src/workflows/events.js";

describe("WorkflowEventStream", () => {
  it("为并发写入分配严格递增事件 id 并支持 since 查询", async () => {
    const stream = new WorkflowEventStream("run-1");
    await Promise.all([
      Promise.resolve().then(() => stream.emit({ type: "node.log", nodeId: "a", level: "info", message: "a" })),
      Promise.resolve().then(() => stream.emit({ type: "node.log", nodeId: "b", level: "info", message: "b" })),
      Promise.resolve().then(() => stream.emit({ type: "run.status", status: "running" })),
    ]);

    expect(stream.list().map((event) => event.id)).toEqual([1, 2, 3]);
    expect(stream.list(1).map((event) => event.id)).toEqual([2, 3]);
  });
});
