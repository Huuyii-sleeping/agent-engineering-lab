import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorktreeStore, normalizeWorktreeCloseout } from "../../../src/tools/worktree-store.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

async function makeWorktreeRoot(): Promise<string> {
  tempDir = await mkdtemp(path.join(tmpdir(), "worktree-store-test-"));
  const worktreeRoot = path.join(tempDir, ".worktrees");
  await mkdir(worktreeRoot, { recursive: true });
  return worktreeRoot;
}

describe("tools/worktree-store", () => {
  it("normalizes legacy worktree records and closeout shape", async () => {
    const worktreeRoot = await makeWorktreeRoot();
    await writeFile(
      path.join(worktreeRoot, "index.json"),
      `${JSON.stringify([
        {
          name: "lane-a",
          path: "/tmp/lane-a",
          status: "unexpected",
          createdAt: "bad",
          updatedAt: "bad",
          lastEnteredAt: "2026-05-12T00:00:00.000Z",
          lastCommandAt: null,
          lastCommandPreview: 123,
          closeout: { action: "keep", at: "bad", forced: 1 },
        },
      ])}\n`,
      "utf8",
    );
    await writeFile(path.join(worktreeRoot, "events.jsonl"), "", "utf8");

    const store = new WorktreeStore(worktreeRoot);
    const records = await store.loadIndex();

    expect(records).toMatchObject([
      {
        schemaVersion: 3,
        name: "lane-a",
        path: "/tmp/lane-a",
        status: "created",
        lastCommandAt: null,
        lastCommandPreview: "123",
        closeout: { action: "keep", forced: true },
      },
    ]);
    expect(Number.isFinite(records[0].createdAt)).toBe(true);
    expect(Number.isFinite(records[0].updatedAt)).toBe(true);
    expect(Number.isFinite(records[0].lastEnteredAt)).toBe(true);
    expect(Number.isFinite(records[0].closeout?.at)).toBe(true);
  });

  it("appends event jsonl without changing line shape", async () => {
    const worktreeRoot = await makeWorktreeRoot();
    const store = new WorktreeStore(worktreeRoot);

    await store.appendEvent({
      schemaVersion: 3,
      id: "evt_1",
      type: "create",
      name: "lane-a",
      at: 123,
      detail: "workdir_fallback",
    });

    const raw = await readFile(path.join(worktreeRoot, "events.jsonl"), "utf8");
    expect(raw).toBe(
      `${JSON.stringify({
        schemaVersion: 3,
        id: "evt_1",
        type: "create",
        name: "lane-a",
        at: 123,
        detail: "workdir_fallback",
      })}\n`,
    );
  });

  it("rejects invalid closeout values", () => {
    expect(normalizeWorktreeCloseout({ action: "drop" })).toBeNull();
    expect(normalizeWorktreeCloseout(null)).toBeNull();
  });
});
