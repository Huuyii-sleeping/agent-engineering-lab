import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getOrCreateMastraRuntime,
  shutdownMastraRuntime,
} from "../../../../src/mastra/instance/factory.js";

let root = "";

afterEach(async () => {
  if (root) {
    await shutdownMastraRuntime({ root });
    await rm(root, { recursive: true, force: true });
  }
  root = "";
});

describe("mastra/instance/factory", () => {
  it("returns one shared initialized Mastra instance per runtime namespace", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-factory-"));

    const first = await getOrCreateMastraRuntime({ root });
    const second = await getOrCreateMastraRuntime({ root });

    expect(second).toBe(first);
    await expect(first.storage.getStore("workflows")).resolves.toBeTruthy();
    expect(first.mastra.getMemory("orbit-message-history")).toBe(first.memory);

    await shutdownMastraRuntime({ root });
    const recreated = await getOrCreateMastraRuntime({ root });
    expect(recreated).not.toBe(first);
  });
});
