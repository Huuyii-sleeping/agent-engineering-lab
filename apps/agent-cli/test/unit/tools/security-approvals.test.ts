import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SecurityApprovalStore, normalizeApprovalRequest } from "../../../src/tools/security-approvals.js";
import type { ApprovalRequest } from "../../../src/tools/security-types.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

async function makeApprovalPath(): Promise<string> {
  tempDir = await mkdtemp(path.join(tmpdir(), "security-approvals-test-"));
  const securityRoot = path.join(tempDir, ".security");
  await mkdir(securityRoot, { recursive: true });
  return path.join(securityRoot, "approvals.json");
}

describe("tools/security-approvals", () => {
  it("normalizes malformed approval records using existing defaults", () => {
    const normalized = normalizeApprovalRequest({
      request_id: 123 as unknown as string,
      risk: "unexpected" as ApprovalRequest["risk"],
      status: "unknown" as ApprovalRequest["status"],
      createdAt: "bad" as unknown as number,
      expiresAt: "bad" as unknown as number,
      decidedAt: "bad" as unknown as number,
    });

    expect(normalized.request_id).toBe("123");
    expect(normalized.risk).toBe("medium");
    expect(normalized.status).toBe("pending");
    expect(Number.isFinite(normalized.createdAt)).toBe(true);
    expect(Number.isFinite(normalized.expiresAt)).toBe(true);
    expect(normalized.decidedAt).toBe(0);
  });

  it("loads and saves approval store JSON without changing its array shape", async () => {
    const approvalPath = await makeApprovalPath();
    await writeFile(
      approvalPath,
      `${JSON.stringify([
        {
          request_id: "apr_1",
          action: "write_file",
          risk: "high",
          reason: "fixture",
          scope: "{}",
          status: "approved",
          createdAt: 10,
          expiresAt: 20,
        },
      ])}\n`,
      "utf8",
    );

    const store = new SecurityApprovalStore(approvalPath);
    const loaded = await store.load();
    expect(loaded).toMatchObject([{ request_id: "apr_1", action: "write_file", status: "approved" }]);

    loaded[0].status = "consumed";
    await store.save(loaded);
    const saved = JSON.parse(await readFile(approvalPath, "utf8")) as ApprovalRequest[];
    expect(saved).toMatchObject([{ request_id: "apr_1", status: "consumed" }]);
  });
});
