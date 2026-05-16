import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SecurityManager } from "../../../src/tools/security-manager.js";
import { enforceSecurityGate } from "../../../src/tools/security.js";
import type { ApprovalRequest } from "../../../src/tools/security-types.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

async function makeManager(): Promise<SecurityManager> {
  tempDir = await mkdtemp(path.join(tmpdir(), "security-manager-test-"));
  return new SecurityManager(path.join(tempDir, ".security"), path.join(tempDir, ".audit"));
}

describe("tools/security-manager", () => {
  it("requires approval, consumes it once, then blocks the same scoped call again", async () => {
    const manager = await makeManager();
    const args = { path: "tmp/out.txt", content: "token=sk-12345678901234567890" };

    const firstGate = await manager.gate("write_file", args);
    expect(firstGate.ok).toBe(false);
    if (!firstGate.ok) {
      expect(JSON.parse(firstGate.blocked)).toMatchObject({
        ok: false,
        error: { code: "SECURITY_APPROVAL_REQUIRED" },
        matchedRule: "write-file-approval",
      });
    }

    const approval = JSON.parse(await manager.createApproval("write_file", args)) as {
      request?: ApprovalRequest;
    };
    expect(approval.request?.status).toBe("pending");
    expect(approval.request?.scope).toContain("[REDACTED_SECRET]");
    expect(approval.request?.scope).not.toContain("sk-12345678901234567890");
    expect(approval.request?.scopeHash).toBeTruthy();

    const approved = JSON.parse(await manager.approve(approval.request?.request_id)) as {
      request?: ApprovalRequest;
    };
    expect(approved.request?.status).toBe("approved");

    await expect(manager.gate("write_file", args)).resolves.toEqual({ ok: true });

    const secondGate = await manager.gate("write_file", args);
    expect(secondGate.ok).toBe(false);

    const approvals = JSON.parse(await manager.listApprovals("consumed")) as { approvals?: ApprovalRequest[] };
    expect(approvals.approvals).toMatchObject([
      {
        request_id: approval.request?.request_id,
        status: "consumed",
        scopeHash: approval.request?.scopeHash,
      },
    ]);

    const rawApprovals = await readFile(path.join(tempDir, ".security", "approvals.json"), "utf8");
    expect(rawApprovals).toContain("[REDACTED_SECRET]");
    expect(rawApprovals).not.toContain("sk-12345678901234567890");
  });

  it("keeps security tools outside their own gate and writes existing audit event shapes", async () => {
    await expect(enforceSecurityGate("security_approve", { request_id: "apr_1" })).resolves.toEqual({ ok: true });

    const manager = await makeManager();
    await manager.gate("read_file", { path: "README.md" });

    const rawAudit = await readFile(path.join(tempDir, ".audit", "security_events.jsonl"), "utf8");
    const events = rawAudit
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type?: string; payload?: Record<string, unknown> });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "policy_decision",
          payload: expect.objectContaining({ toolName: "read_file", decision: "allow" }),
        }),
        expect.objectContaining({
          type: "execution_allowed",
          payload: expect.objectContaining({ toolName: "read_file", reason: "default allow", risk: "low" }),
        }),
      ]),
    );
  });

  it("keeps legacy scope matching compatibility for older approval records", async () => {
    const manager = await makeManager();
    const args = { path: "tmp/legacy.txt", content: "secret=legacy-token" };
    const rawScope = JSON.stringify({ toolName: "write_file", args });
    const approvalsPath = path.join(tempDir, ".security", "approvals.json");

    await manager.listApprovals();
    await writeFile(
      approvalsPath,
      `${JSON.stringify([
        {
          request_id: "apr_legacy",
          action: "write_file",
          risk: "medium",
          reason: "legacy record",
          scope: rawScope,
          status: "approved",
          createdAt: Date.now() - 1000,
          expiresAt: Date.now() + 60_000,
        },
      ])}\n`,
      "utf8",
    );

    await expect(manager.consumeApproval("write_file", args)).resolves.toBe(true);
  });
});
