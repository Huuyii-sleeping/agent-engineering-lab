import { readFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import { normalizeApprovalRequest } from "./tools/security-approvals.js";
import type { ApprovalRequest } from "./tools/security-types.js";
import { safeJsonParse } from "./tools/security-types.js";

export type CliPermissionMode = "default" | "accept-edits" | "plan";

export type CliApprovalSummary = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
  consumed: number;
};

let CURRENT_PERMISSION_MODE: CliPermissionMode =
  process.env.AGENT_PERMISSION_MODE?.trim() === "accept-edits"
    ? "accept-edits"
    : process.env.AGENT_PERMISSION_MODE?.trim() === "plan"
      ? "plan"
      : "default";

const PLAN_BLOCKED_TOOLS = new Set([
  "bash",
  "background_run",
  "delivery_validate",
  "edit_file",
  "write_file",
  "worktree_closeout",
  "worktree_create",
  "worktree_enter",
  "worktree_keep",
  "worktree_remove",
  "worktree_run",
  "subagent_close",
  "subagent_send",
  "subagent_spawn",
]);

function isWorkspaceMutationTool(name: string): boolean {
  return PLAN_BLOCKED_TOOLS.has(name) || name.startsWith("mcp__");
}

export function getCliPermissionMode(): CliPermissionMode {
  return CURRENT_PERMISSION_MODE;
}

export function setCliPermissionMode(mode: CliPermissionMode): void {
  CURRENT_PERMISSION_MODE = mode;
}

export function resetCliPermissionModeForTest(): void {
  CURRENT_PERMISSION_MODE = "default";
}

export function describeCliPermissionMode(mode: CliPermissionMode): string {
  if (mode === "accept-edits") {
    return "auto-accept file edits, keep other approvals";
  }
  if (mode === "plan") {
    return "read-only planning mode";
  }
  return "default approval flow";
}

export function formatCliPermissionMode(mode: CliPermissionMode): string {
  return mode === "accept-edits" ? "accept-edits" : mode;
}

export function applyCliPermissionMode(toolName: string): { ok: true } | { ok: false; blocked: string } | null {
  if (CURRENT_PERMISSION_MODE === "default") {
    return null;
  }

  if (CURRENT_PERMISSION_MODE === "accept-edits" && (toolName === "write_file" || toolName === "edit_file")) {
    return { ok: true };
  }

  if (CURRENT_PERMISSION_MODE === "plan" && isWorkspaceMutationTool(toolName)) {
    return {
      ok: false,
      blocked: `blocked by permission mode: ${CURRENT_PERMISSION_MODE} does not allow ${toolName}`,
    };
  }

  return null;
}

export async function collectCliApprovalSummary(): Promise<CliApprovalSummary> {
  const approvalPath = path.join(process.cwd(), ".security", "approvals.json");
  const raw = await readFile(approvalPath, "utf8").catch(() => "");
  const parsed = safeJsonParse<Array<Partial<ApprovalRequest>>>(raw, []);
  const approvals = parsed.map((item) => normalizeApprovalRequest(item));
  return approvals.reduce<CliApprovalSummary>(
    (summary, approval) => {
      summary.total += 1;
      summary[approval.status] += 1;
      return summary;
    },
    {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      expired: 0,
      consumed: 0,
    },
  );
}
