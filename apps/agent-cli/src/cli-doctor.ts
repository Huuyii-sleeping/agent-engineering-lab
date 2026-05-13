import { access, constants, readFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import type { AgentAppRuntimeDeps } from "./bootstrap/app-runtime.js";
import { collectCliApprovalSummary, getCliPermissionMode } from "./cli-permissions.js";
import {
  getCliUiTheme,
  type CliConfigSnapshot,
  type CliDoctorCheck,
  type CliPermissionSnapshot,
  type CliDoctorReport,
  type CliStatusSnapshot,
  type CliUsageSnapshot,
} from "./cli-ui.js";
import { loadHooksConfig } from "./hooks/config.js";
import { readModelUsageSnapshot } from "./model-policy.js";
import { loadMcpServerConfigs } from "./tools/mcp-config.js";
import { RUNTIME_CONFIG } from "./runtime-config.js";
import { listWorkspaceRoots } from "./workspace-roots.js";

async function readPackageJson(): Promise<{ scripts?: Record<string, string> }> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
  } catch {
    return {};
  }
}

async function countHooks(): Promise<number> {
  const config = await loadHooksConfig();
  return Object.values(config.hooks ?? {}).reduce((sum, hooks) => sum + (hooks?.length ?? 0), 0);
}

export async function collectCliStatusSnapshot(input: {
  mode: string;
  activeSessionId: string | null;
  sessionCount: number;
  bridgeEndpoint: string;
  app?: AgentAppRuntimeDeps;
  toolMetadata?: Array<Record<string, string>>;
  model?: string;
}): Promise<CliStatusSnapshot> {
  const tools = input.toolMetadata ?? (input.app ? await input.app.toolService.listToolMetadata() : []);
  const mcpServers = await loadMcpServerConfigs();
  const hookCount = await countHooks();
  const model = input.model ?? input.app?.model ?? process.env.MODEL_ID?.trim() ?? "unset-model";
  const approvals = await collectCliApprovalSummary();
  const usage = await readModelUsageSnapshot(model);
  return {
    workspace: path.basename(process.cwd()),
    mode: input.mode,
    model,
    activeSessionId: input.activeSessionId,
    sessionCount: input.sessionCount,
    toolCount: tools.length,
    mcpToolCount: tools.filter((tool) => tool.target === "mcp").length,
    mcpServerCount: mcpServers.length,
    hookCount,
    bridgeEndpoint: input.bridgeEndpoint,
    schedulerStatus: `${RUNTIME_CONFIG.schedulerPollIntervalMs}ms`,
    theme: getCliUiTheme(),
    permissionMode: getCliPermissionMode(),
    pendingApprovals: approvals.pending,
    workspaceRoots: listWorkspaceRoots(),
    sessionPromptTokens: usage.sessionPromptTokens,
    sessionCompletionTokens: usage.sessionCompletionTokens,
    dailyPromptTokens: usage.dailyPromptTokens,
    dailyCompletionTokens: usage.dailyCompletionTokens,
    sessionEstimatedCostUsd: usage.sessionEstimatedCostUsd,
    dailyEstimatedCostUsd: usage.dailyEstimatedCostUsd,
    sessionTokenBudget: usage.sessionTokenBudget,
    dailyTokenBudget: usage.dailyTokenBudget,
  };
}

export async function collectCliConfigSnapshot(input: { model?: string } = {}): Promise<CliConfigSnapshot> {
  const packageJson = await readPackageJson();
  const mcpConfigPath = path.join(process.cwd(), ".codex", "mcp.json");
  const hooksConfigPath = path.join(process.cwd(), ".codex", "hooks.json");
  const mcpConfigured = (await loadMcpServerConfigs()).length > 0;
  const hooksConfigured = (await countHooks()) > 0;
  return {
    modelConfigured: Boolean((input.model ?? process.env.MODEL_ID)?.trim()),
    model: input.model ?? process.env.MODEL_ID?.trim() ?? "unset-model",
    openAiBaseUrl: process.env.OPENAI_BASE_URL?.trim() || "",
    mcpConfigPath,
    mcpConfigured,
    hooksConfigPath,
    hooksConfigured,
    releaseCheckConfigured: Boolean(packageJson.scripts?.["release:check"]),
    theme: getCliUiTheme(),
    permissionMode: getCliPermissionMode(),
    workspaceRoots: listWorkspaceRoots(),
  };
}

export async function collectCliPermissionSnapshot(): Promise<CliPermissionSnapshot> {
  const approvals = await collectCliApprovalSummary();
  return {
    mode: getCliPermissionMode(),
    pendingApprovals: approvals.pending,
    approvedApprovals: approvals.approved,
    rejectedApprovals: approvals.rejected,
    expiredApprovals: approvals.expired,
    consumedApprovals: approvals.consumed,
  };
}

export async function collectCliUsageSnapshot(model?: string): Promise<CliUsageSnapshot> {
  return readModelUsageSnapshot(model);
}

export async function runCliDoctor(): Promise<CliDoctorReport> {
  const checks: CliDoctorCheck[] = [];
  const cwd = process.cwd();
  const codexDir = path.join(cwd, ".codex");
  const packageJson = await readPackageJson();
  const mcpServers = await loadMcpServerConfigs();
  const hookCount = await countHooks();
  const approvals = await collectCliApprovalSummary();
  const roots = listWorkspaceRoots();

  checks.push({
    id: "node-version",
    label: "node",
    severity: "pass",
    reason: `running ${process.version}`,
    suggestion: "",
  });

  checks.push({
    id: "model-id",
    label: "model",
    severity: process.env.MODEL_ID?.trim() ? "pass" : "error",
    reason: process.env.MODEL_ID?.trim()
      ? `MODEL_ID=${process.env.MODEL_ID?.trim()}`
      : "MODEL_ID is not configured",
    suggestion: process.env.MODEL_ID?.trim() ? "" : "set MODEL_ID before running natural-language agent queries",
  });

  checks.push({
    id: "api-config",
    label: "api",
    severity: process.env.OPENAI_API_KEY?.trim() || process.env.OPENAI_BASE_URL?.trim() ? "pass" : "warn",
    reason:
      process.env.OPENAI_API_KEY?.trim() || process.env.OPENAI_BASE_URL?.trim()
        ? "OpenAI-compatible endpoint configuration detected"
        : "no OPENAI_API_KEY or OPENAI_BASE_URL detected",
    suggestion:
      process.env.OPENAI_API_KEY?.trim() || process.env.OPENAI_BASE_URL?.trim()
        ? ""
        : "set OPENAI_API_KEY or point OPENAI_BASE_URL at a compatible proxy",
  });

  try {
    await access(cwd, constants.R_OK | constants.W_OK);
    checks.push({
      id: "workspace",
      label: "workspace",
      severity: "pass",
      reason: `read/write access available: ${cwd}`,
      suggestion: "",
    });
  } catch {
    checks.push({
      id: "workspace",
      label: "workspace",
      severity: "error",
      reason: `missing read/write access: ${cwd}`,
      suggestion: "switch to a writable project directory before editing files",
    });
  }

  try {
    await access(codexDir, constants.R_OK | constants.W_OK);
    checks.push({
      id: "codex-dir",
      label: ".codex",
      severity: "pass",
      reason: `${codexDir} is available`,
      suggestion: "",
    });
  } catch {
    checks.push({
      id: "codex-dir",
      label: ".codex",
      severity: "warn",
      reason: `${codexDir} is missing or not writable`,
      suggestion: "create .codex if you want local MCP, hook, or runtime config files",
    });
  }

  checks.push({
    id: "mcp",
    label: "mcp",
    severity: mcpServers.length > 0 ? "pass" : "warn",
    reason: mcpServers.length > 0 ? `${mcpServers.length} server(s) configured` : "no MCP servers configured",
    suggestion: mcpServers.length > 0 ? "" : "add .codex/mcp.json if you want external tools",
  });

  checks.push({
    id: "hooks",
    label: "hooks",
    severity: hookCount > 0 ? "pass" : "warn",
    reason: hookCount > 0 ? `${hookCount} hook command(s) configured` : "no hooks configured",
    suggestion: hookCount > 0 ? "" : "add .codex/hooks.json if you want session or tool lifecycle hooks",
  });

  checks.push({
    id: "release-check",
    label: "release check",
    severity: packageJson.scripts?.["release:check"] ? "pass" : "warn",
    reason: packageJson.scripts?.["release:check"] ? "release:check script available" : "release:check script missing",
    suggestion: packageJson.scripts?.["release:check"] ? "" : "add a release:check script for local validation closeout",
  });

  checks.push({
    id: "permissions",
    label: "permissions",
    severity: "pass",
    reason: `${getCliPermissionMode()} mode / ${approvals.pending} pending approval(s)`,
    suggestion: approvals.pending > 0 ? "run /permissions to inspect approval state before continuing" : "",
  });

  checks.push({
    id: "workspace-roots",
    label: "workspace roots",
    severity: "pass",
    reason: `${roots.length} readable root(s) active`,
    suggestion: roots.length > 1 ? "" : "run /add-dir <path> if your task spans multiple directories",
  });

  return { checks };
}
