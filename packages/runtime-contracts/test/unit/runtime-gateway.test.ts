import { describe, expect, it } from "vitest";
import { createRuntimeGateway } from "../../src/index.js";

describe("RuntimeGateway", () => {
  it("只组合四个领域 Port 且保留原始实例", () => {
    const ports = {
      agent: { capabilities: async () => ({}) },
      workflow: { capabilities: async () => ({}) },
      tools: { list: async () => [] },
      memory: { listThreads: async () => ({ items: [], nextCursor: null }) },
    } as never;

    const gateway = createRuntimeGateway(ports);

    expect(gateway).toEqual(ports);
    expect(Object.keys(gateway)).toEqual(["agent", "workflow", "tools", "memory"]);
    expect(Object.isFrozen(gateway)).toBe(true);
  });
});
