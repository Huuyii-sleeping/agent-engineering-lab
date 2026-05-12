import { mkdtemp, readFile, rm } from "node:fs/promises";
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
    const args = { path: "tmp/out.txt", content: "hello" };

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

    const approved = JSON.parse(await manager.approve(approval.request?.request_id)) as {
      request?: ApprovalRequest;
    };
    expect(approved.request?.status).toBe("approved");

    await expect(manager.gate("write_file", args)).resolves.toEqual({ ok: true });

    const secondGate = await manager.gate("write_file", args);
    expect(secondGate.ok).toBe(false);

    const approvals = JSON.parse(await manager.listApprovals("consumed")) as { approvals?: ApprovalRequest[] };
    expect(approvals.approvals).toMatchObject([{ request_id: approval.request?.request_id, status: "consumed" }]);
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
});
