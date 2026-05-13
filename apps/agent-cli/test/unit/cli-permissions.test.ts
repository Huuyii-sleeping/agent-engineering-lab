import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyCliPermissionMode,
  collectCliApprovalSummary,
  resetCliPermissionModeForTest,
  setCliPermissionMode,
} from "../../src/cli-permissions.js";

const tempDirs: string[] = [];

async function withWorkspace<T>(name: string, fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), `${name}-`));
  tempDirs.push(root);
  const previous = process.cwd();
  process.chdir(root);
  try {
    return await fn(root);
  } finally {
    process.chdir(previous);
  }
}

afterEach(async () => {
  resetCliPermissionModeForTest();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
});

describe("cli permissions", () => {
  it("blocks risky tool execution while in plan mode", () => {
    setCliPermissionMode("plan");
    expect(applyCliPermissionMode("write_file")).toMatchObject({ ok: false });
    expect(applyCliPermissionMode("read_file")).toBeNull();
  });

  it("summarizes local approval queue counts", async () => {
    await withWorkspace("cli-permissions", async (root) => {
      await mkdir(path.join(root, ".security"), { recursive: true });
      await writeFile(
        path.join(root, ".security", "approvals.json"),
        `${JSON.stringify([
          {
            request_id: "apr_1",
            action: "write_file",
            risk: "medium",
            reason: "fixture",
            scope: "{}",
            status: "pending",
            createdAt: 1,
            expiresAt: 2,
          },
          {
            request_id: "apr_2",
            action: "bash",
            risk: "high",
            reason: "fixture",
            scope: "{}",
            status: "approved",
            createdAt: 1,
            expiresAt: 2,
          },
        ])}\n`,
        "utf8",
      );

      expect(await collectCliApprovalSummary()).toMatchObject({
        total: 2,
        pending: 1,
        approved: 1,
      });
    });
  });
});
