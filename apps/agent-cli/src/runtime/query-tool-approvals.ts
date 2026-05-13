import type { AgentRuntimeState, PendingApprovalReplay } from "./query-types.js";

function ensurePendingApprovalMap(runtimeState: AgentRuntimeState): Map<string, PendingApprovalReplay> {
  if (!runtimeState.pendingApprovalReplays) {
    runtimeState.pendingApprovalReplays = new Map<string, PendingApprovalReplay>();
  }
  return runtimeState.pendingApprovalReplays;
}

function parseRequestId(output: string): string {
  try {
    const parsed = JSON.parse(output) as { request?: { request_id?: unknown } };
    return String(parsed.request?.request_id ?? "").trim();
  } catch {
    return "";
  }
}

export function trackPendingApprovalCandidate(
  runtimeState: AgentRuntimeState,
  toolName: string,
  argumentsJson: string,
  preview: string,
): void {
  runtimeState.pendingApprovalCandidate = {
    toolName,
    argumentsJson,
    preview,
    createdAt: Date.now(),
  };
}

export function linkApprovalRequestToCandidate(
  runtimeState: AgentRuntimeState,
  toolArgs: Record<string, unknown>,
  toolOutput: string,
): void {
  const candidate = runtimeState.pendingApprovalCandidate;
  runtimeState.pendingApprovalCandidate = null;
  if (!candidate) {
    return;
  }
  const requestedTool = typeof toolArgs.tool === "string" ? toolArgs.tool.trim() : "";
  const requestId = parseRequestId(toolOutput);
  if (!requestedTool || requestedTool !== candidate.toolName || !requestId) {
    return;
  }
  ensurePendingApprovalMap(runtimeState).set(requestId, {
    ...candidate,
    requestId,
  });
}

export function popPendingApprovalReplay(
  runtimeState: AgentRuntimeState,
  requestId: string,
): PendingApprovalReplay | null {
  const approvals = ensurePendingApprovalMap(runtimeState);
  const replay = approvals.get(requestId) ?? null;
  approvals.delete(requestId);
  return replay;
}

export function peekPendingApprovalReplay(
  runtimeState: AgentRuntimeState,
  requestId: string,
): PendingApprovalReplay | null {
  return ensurePendingApprovalMap(runtimeState).get(requestId) ?? null;
}

export function dropPendingApprovalReplay(runtimeState: AgentRuntimeState, requestId: string): void {
  ensurePendingApprovalMap(runtimeState).delete(requestId);
}
