import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupMastraRuntimeData,
  ensureMastraRuntimePaths,
  resolveMastraRuntimePaths,
} from "../../../../src/mastra/storage/paths.js";

let root = "";

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = "";
});

describe("mastra/storage/paths", () => {
  it("uses the versioned .runtime namespace and supports explicit cleanup", async () => {
    root = await mkdtemp(path.join(tmpdir(), "orbit-mastra-paths-"));
    const paths = resolveMastraRuntimePaths(root);

    expect(paths.root).toBe(path.join(root, ".runtime", "mastra", "v1"));
    expect(paths.databaseUrl).toBe(`file:${path.join(paths.root, "mastra.db")}`);

    await ensureMastraRuntimePaths(paths);
    await writeFile(path.join(paths.root, "marker"), "test", "utf8");
    await cleanupMastraRuntimeData({ root });

    await expect(access(paths.root)).rejects.toBeTruthy();
  });
});
