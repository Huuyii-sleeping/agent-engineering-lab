import { isReplayDryRun } from "../observability/runtime.js";
import { enforceSecurityGate } from "../tools/security.js";

export type ToolExecutionTarget = "base" | "subagent" | "mcp" | "unknown";

export type ToolExecution = {
  target: ToolExecutionTarget;
  name: string;
  argumentsJson: string;
  args: Record<string, unknown>;
  parseError?: string;
};

type ExecuteToolHandlerOptions = {
  name: string;
  args: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<string>;
  allowDuringReplay?: boolean;
};

const TOOL_RUNTIME_ERROR = (message: string): string =>
  JSON.stringify({ ok: false, error: { code: "TOOL_RUNTIME_ERROR", message } });

export function createToolInputParseError(name: string, message: string): string {
  return JSON.stringify({
    ok: false,
    error: { code: "TOOL_INPUT_PARSE_ERROR", message: `invalid arguments for ${name}: ${message}` },
  });
}

export function createToolInputValidationError(name: string, errors: string[]): string {
  return JSON.stringify({
    ok: false,
    error: { code: "TOOL_INPUT_VALIDATION_ERROR", message: `invalid arguments for ${name}`, details: errors },
  });
}

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

function parseToolArgsStrict(argumentsJson: string): { args: Record<string, unknown>; parseError?: string } {
  try {
    const parsed = JSON.parse(argumentsJson || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { args: {}, parseError: "arguments must be a JSON object" };
    }
    return { args: parsed as Record<string, unknown> };
  } catch (error) {
    return { args: {}, parseError: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function isObjectSchema(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function typeMatches(expected: string, value: unknown): boolean {
  if (expected === "array") {
    return Array.isArray(value);
  }
  if (expected === "integer") {
    return Number.isInteger(value);
  }
  if (expected === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }
  if (expected === "object") {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  if (expected === "boolean") {
    return typeof value === "boolean";
  }
  if (expected === "string") {
    return typeof value === "string";
  }
  return true;
}

function validateValue(path: string, schema: Record<string, unknown>, value: unknown): string[] {
  const errors: string[] = [];
  const type = typeof schema.type === "string" ? schema.type : "";
  if (type && !typeMatches(type, value)) {
    errors.push(`${path} must be ${type}`);
    return errors;
  }
  const enumValues = Array.isArray(schema.enum) ? schema.enum : null;
  if (enumValues && !enumValues.includes(value)) {
    errors.push(`${path} must be one of ${enumValues.map(String).join(", ")}`);
  }
  if (type === "array" && Array.isArray(value) && isObjectSchema(schema.items)) {
    value.forEach((item, index) => {
      errors.push(...validateValue(`${path}[${index}]`, schema.items as Record<string, unknown>, item));
    });
  }
  return errors;
}

export function validateToolInput(parameters: unknown, args: Record<string, unknown>): string[] {
  if (!isObjectSchema(parameters)) {
    return [];
  }
  const errors: string[] = [];
  const required = Array.isArray(parameters.required) ? parameters.required.map(String) : [];
  for (const key of required) {
    if (args[key] === undefined) {
      errors.push(`${key} is required`);
    }
  }
  const properties = isObjectSchema(parameters.properties) ? parameters.properties : {};
  for (const [key, schema] of Object.entries(properties)) {
    if (args[key] === undefined || !isObjectSchema(schema)) {
      continue;
    }
    errors.push(...validateValue(key, schema, args[key]));
  }
  return errors;
}

export function resolveToolExecution(
  name: string,
  argumentsJson: string,
  subagentNames: ReadonlySet<string>,
): ToolExecution {
  const parsed = parseToolArgsStrict(argumentsJson);
  if (subagentNames.has(name)) {
    return {
      target: "subagent",
      name,
      argumentsJson,
      args: parsed.args,
      parseError: parsed.parseError,
    };
  }
  if (name.startsWith("mcp__")) {
    return {
      target: "mcp",
      name,
      argumentsJson,
      args: parsed.args,
      parseError: parsed.parseError,
    };
  }
  return {
    target: "base",
    name,
    argumentsJson,
    args: parsed.args,
    parseError: parsed.parseError,
  };
}

export async function executeProtectedToolHandler(opts: ExecuteToolHandlerOptions): Promise<string> {
  if (isReplayDryRun() && !opts.allowDuringReplay) {
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
