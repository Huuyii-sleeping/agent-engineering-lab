import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { runWriteFile, safePath } from "../../src/tools/file-tools.js";
import { addWorkspaceRoot, listWorkspaceRoots, resetWorkspaceRootsForTest } from "../../src/workspace-roots.js";

const tempDirs: string[] = [];

async function withWorkspace<T>(name: string, fn: (root: string, extra: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), `${name}-`));
  const extra = path.join(root, "..", `${path.basename(root)}-extra`);
  tempDirs.push(root, extra);
  await mkdir(extra, { recursive: true });
  await writeFile(path.join(extra, "note.txt"), "ok\n", "utf8");
  const previous = process.cwd();
  process.chdir(root);
  try {
    return await fn(root, extra);
  } finally {
    process.chdir(previous);
  }
}

afterEach(async () => {
  resetWorkspaceRootsForTest();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
});

describe("workspace roots", () => {
  it("adds readable roots and allows safePath to traverse them", async () => {
    await withWorkspace("workspace-roots", async (root, extra) => {
      const added = await addWorkspaceRoot(extra);
      expect(added).toEqual({ ok: true, root: extra });
      expect(listWorkspaceRoots()[0]).toContain(path.basename(root));
      expect(listWorkspaceRoots()).toContain(extra);
      expect(safePath(path.join(extra, "note.txt"))).toBe(path.join(extra, "note.txt"));
    });
  });

  it("rejects paths that escape through a workspace symlink", async () => {
    await withWorkspace("workspace-roots-link", async (root, extra) => {
      const link = path.join(root, "linked-outside");
      await symlink(extra, link, "junction");

      expect(() => safePath(path.join(link, "note.txt"))).toThrow("PATH_OUT_OF_BOUNDS");
    });
  });

  it("blocks writes into sensitive internal paths", async () => {
    await withWorkspace("workspace-roots-deny", async () => {
      const result = await runWriteFile(".git/config", "unsafe=true\n");

      expect(result).toContain("PATH_OUT_OF_BOUNDS");
    });
  });
});
