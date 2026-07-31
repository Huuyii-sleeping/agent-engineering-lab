import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MastraRunMappingRepository } from "../../../../src/mastra/storage/run-mapping-repository.js";

let root = "";

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = "";
});

describe("mastra/storage/run-mapping-repository", () => {
  it("persists immutable product-to-Mastra run mappings across repository instances", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-run-map-"));
    const first = new MastraRunMappingRepository({ root });

    const bound = await first.bind({
      domain: "agent",
      productRunId: "product-run-1",
      mastraRunId: "mastra-run-1",
      adapterVersion: "adapter-v1",
    });
    await expect(first.bind({
      domain: "agent",
      productRunId: "product-run-1",
      mastraRunId: "mastra-run-2",
      adapterVersion: "adapter-v1",
    })).rejects.toThrow("不可变");

    const restored = await new MastraRunMappingRepository({ root }).get("agent", "product-run-1");
    expect(restored).toEqual(bound);
  });
});
