import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { applyCliPermissionMode, getCliPermissionMode } from "../cli/permissions.js";
import { SecurityManager } from "./security-manager.js";
import type { SecurityGateResult } from "./security-types.js";
import { fail, parseArgsJson } from "./security-types.js";

const SECURITY = new SecurityManager();

export const SECURITY_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "security_check",
      description: "Check policy decision for a tool call.",
      parameters: {
        type: "object",
        properties: {
          tool: { type: "string" },
          args_json: { type: "string" },
        },
        required: ["tool"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "security_request_approval",
      description: "Create an approval request for a specific tool call.",
      parameters: {
        type: "object",
        properties: {
          tool: { type: "string" },
          args_json: { type: "string" },
        },
        required: ["tool"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "security_approve",
      description: "Approve an approval request by request_id.",
      parameters: {
        type: "object",
        properties: {
          request_id: { type: "string" },
        },
        required: ["request_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "security_reject",
      description: "Reject an approval request by request_id.",
      parameters: {
        type: "object",
        properties: {
          request_id: { type: "string" },
        },
        required: ["request_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "security_list_approvals",
      description: "List approval requests, optionally by status.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "approved", "rejected", "expired", "consumed"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "security_reload_policy",
      description: "Reload security policy from .security/policy.json.",
      parameters: { type: "object", properties: {} },
    },
  },
];

export async function runSecurityCheck(tool: unknown, argsJson: unknown): Promise<string> {
  const toolName = String(tool ?? "").trim();
  if (!toolName) {
    return fail("INVALID_ARGUMENT", "security_check requires tool");
  }
  return SECURITY.check(toolName, parseArgsJson(argsJson));
}

export async function runSecurityRequestApproval(tool: unknown, argsJson: unknown): Promise<string> {
  const toolName = String(tool ?? "").trim();
  if (!toolName) {
    return fail("INVALID_ARGUMENT", "security_request_approval requires tool");
  }
  return SECURITY.createApproval(toolName, parseArgsJson(argsJson));
}

export async function runSecurityApprove(requestId: unknown): Promise<string> {
  return SECURITY.approve(requestId);
}

export async function runSecurityReject(requestId: unknown): Promise<string> {
  return SECURITY.reject(requestId);
}

export async function runSecurityListApprovals(status: unknown): Promise<string> {
  return SECURITY.listApprovals(status);
}

export async function runSecurityReloadPolicy(): Promise<string> {
  return SECURITY.reloadPolicy();
}

export async function enforceSecurityGate(toolName: string, args: Record<string, unknown>): Promise<SecurityGateResult> {
  const bypass = toolName.startsWith("security_");
  if (bypass) {
    return { ok: true };
  }
  const permissionModeResult = applyCliPermissionMode(toolName);
  if (permissionModeResult?.ok) {
    return { ok: true };
  }
  if (permissionModeResult && !permissionModeResult.ok) {
    return {
      ok: false,
      blocked: fail("SECURITY_PERMISSION_MODE", permissionModeResult.blocked, {
        mode: getCliPermissionMode(),
      }),
    };
  }
  return SECURITY.gate(toolName, args);
}
