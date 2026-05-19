import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { resetCliPermissionModeForTest, setCliPermissionMode } from "../../src/cli/permissions.js";
import { runBaseToolByName } from "../../src/tools/base.js";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function asJson(raw: string): Record<string, unknown> {
  return JSON.parse(raw) as Record<string, unknown>;
}

async function cleanDirs(): Promise<void> {
  const targets = [".security", ".audit"];
  for (const target of targets) {
    await rm(path.join(process.cwd(), target), { recursive: true, force: true }).catch(() => {});
  }
}

async function main(): Promise<void> {
  await cleanDirs();
  process.env.AGENT_BASH_SANDBOX_MODE = "strict-readonly";
  const writeArgs = { path: "tmp/a.txt", content: "token=sk-12345678901234567890" };

  const deniedRaw = await runBaseToolByName("bash", JSON.stringify({ command: "shutdown /s /t 0" }));
  const denied = asJson(deniedRaw);
  assert(denied.ok === false, "critical command should be blocked");
  assert(
    (denied.error as { code?: string } | undefined)?.code === "SECURITY_POLICY_DENY",
    "critical command should return SECURITY_POLICY_DENY",
  );

  setCliPermissionMode("plan");
  const planBlockedRaw = await runBaseToolByName("bash", JSON.stringify({ command: "touch blocked.txt" }));
  resetCliPermissionModeForTest();
  const planBlocked = asJson(planBlockedRaw);
  assert(planBlocked.ok === false, "plan mode should block bash before sandbox");
  assert(
    (planBlocked.error as { code?: string } | undefined)?.code === "SECURITY_PERMISSION_MODE",
    "plan mode should return SECURITY_PERMISSION_MODE before sandbox",
  );

  const reqRaw = await runBaseToolByName(
    "security_request_approval",
    JSON.stringify({
      tool: "write_file",
      args_json: JSON.stringify(writeArgs),
    }),
  );
  const req = asJson(reqRaw);
  const requestId = (req.request as { request_id?: string } | undefined)?.request_id;
  assert(typeof requestId === "string" && requestId.length > 0, "approval request should be created");
  const request = req.request as { scope?: string; scopeHash?: string } | undefined;
  assert(typeof request?.scope === "string" && request.scope.includes("[REDACTED_SECRET]"), "scope should be redacted");
  assert(typeof request?.scopeHash === "string" && request.scopeHash.length > 0, "scope hash should be persisted");

  const approvalsRaw = await readFile(path.join(process.cwd(), ".security", "approvals.json"), "utf8");
  assert(approvalsRaw.includes("[REDACTED_SECRET]"), "approval store should persist redacted preview");
  assert(!approvalsRaw.includes("sk-12345678901234567890"), "approval store should not persist raw secret");

  const notAllowedRaw = await runBaseToolByName(
    "write_file",
    JSON.stringify(writeArgs),
  );
  const notAllowed = asJson(notAllowedRaw);
  assert(notAllowed.ok === false, "write should require approval before approve");
  assert(
    (notAllowed.error as { code?: string } | undefined)?.code === "SECURITY_APPROVAL_REQUIRED",
    "write should return SECURITY_APPROVAL_REQUIRED before approve",
  );

  const approveRaw = await runBaseToolByName("security_approve", JSON.stringify({ request_id: requestId }));
  const approve = asJson(approveRaw);
  assert(approve.ok === true, "approval should pass");

  const allowedRaw = await runBaseToolByName(
    "write_file",
    JSON.stringify(writeArgs),
  );
  assert(!allowedRaw.includes('"ok": false'), "write should pass after approval");

  const highRiskRaw = await runBaseToolByName("bash", JSON.stringify({ command: 'python -c "print(1)"' }));
  const highRisk = asJson(highRiskRaw);
  assert(highRisk.ok === false, "high risk interpreter command should require approval");
  assert(
    (highRisk.error as { code?: string } | undefined)?.code === "SECURITY_APPROVAL_REQUIRED",
    "high risk interpreter command should return SECURITY_APPROVAL_REQUIRED",
  );

  console.log("PRD07_SECURITY_SMOKE_OK");
}

main().catch((error) => {
  console.error("PRD07_SECURITY_SMOKE_FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
