import { isReplayDryRun } from "../observability/runtime.js";
import { enforceSecurityGate } from "../tools/security.js";

export type ToolExecutionTarget = "base" | "subagent" | "mcp" | "unknown";

export type ToolExecution = {
  target: ToolExecutionTarget;
  name: string;
  argumentsJson: string;
  args: Record<string, unknown>;
};

type ExecuteToolHandlerOptions = {
  name: string;
  args: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<string>;
};

const TOOL_RUNTIME_ERROR = (message: string): string =>
  JSON.stringify({ ok: false, error: { code: "TOOL_RUNTIME_ERROR", message } });

export function createReplayDryRunBlocked(name: string): string {
  return JSON.stringify({
    ok: false,
    error: { code: "REPLAY_DRY_RUN_BLOCKED", message: `replay dry-run blocked tool ${name}` },
  });
}

export function parseToolArgs(argumentsJson: string): Record<string, unknown> {
  try {
    return JSON.parse(argumentsJson || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function resolveToolExecution(
  name: string,
  argumentsJson: string,
  subagentNames: ReadonlySet<string>,
): ToolExecution {
  if (subagentNames.has(name)) {
    return {
      target: "subagent",
      name,
      argumentsJson,
      args: parseToolArgs(argumentsJson),
    };
  }
  if (name.startsWith("mcp__")) {
    return {
      target: "mcp",
      name,
      argumentsJson,
      args: parseToolArgs(argumentsJson),
    };
  }
  return {
    target: "base",
    name,
    argumentsJson,
    args: parseToolArgs(argumentsJson),
  };
}

export async function executeProtectedToolHandler(opts: ExecuteToolHandlerOptions): Promise<string> {
  if (isReplayDryRun()) {
    return createReplayDryRunBlocked(opts.name);
  }
  const gate = await enforceSecurityGate(opts.name, opts.args);
  if (!gate.ok) {
    return gate.blocked;
  }
  try {
    return await opts.handler(opts.args);
  } catch (error) {
    return TOOL_RUNTIME_ERROR(error instanceof Error ? error.message : String(error));
  }
}
