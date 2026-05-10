import { rm } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
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

  const deniedRaw = await runBaseToolByName("bash", JSON.stringify({ command: "shutdown /s /t 0" }));
  const denied = asJson(deniedRaw);
  assert(denied.ok === false, "critical command should be blocked");
  assert(
    (denied.error as { code?: string } | undefined)?.code === "SECURITY_POLICY_DENY",
    "critical command should return SECURITY_POLICY_DENY",
  );

  const reqRaw = await runBaseToolByName(
    "security_request_approval",
    JSON.stringify({ tool: "write_file", args_json: JSON.stringify({ path: "tmp/a.txt", content: "x" }) }),
  );
  const req = asJson(reqRaw);
  const requestId = (req.request as { request_id?: string } | undefined)?.request_id;
  assert(typeof requestId === "string" && requestId.length > 0, "approval request should be created");

  const notAllowedRaw = await runBaseToolByName(
    "write_file",
    JSON.stringify({ path: "tmp/a.txt", content: "x" }),
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
    JSON.stringify({ path: "tmp/a.txt", content: "x" }),
  );
  assert(!allowedRaw.includes('"ok": false'), "write should pass after approval");

  console.log("PRD07_SECURITY_SMOKE_OK");
}

main().catch((error) => {
  console.error("PRD07_SECURITY_SMOKE_FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

