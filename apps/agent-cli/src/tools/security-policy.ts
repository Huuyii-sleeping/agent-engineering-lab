import { buildScopePreview, stableScopeHash } from "../security/data-hygiene.js";
import type { PolicyConfig, PolicyDecision, PolicyInput, PolicyRule } from "./security-types.js";

export function defaultSecurityPolicy(): PolicyConfig {
  return {
    schemaVersion: 2,
    rules: [
      {
        id: "bash-critical-deny",
        tool: "bash",
        action: "deny",
        risk: "critical",
        reason: "critical command is denied",
        commandIncludes: ["rm -rf /", "reboot", "shutdown", "format", "diskpart", "del /f /s /q"],
      },
      {
        id: "bash-high-approval",
        tool: "bash",
        action: "require_approval",
        risk: "high",
        reason: "high risk shell command requires approval",
        commandIncludes: ["git reset --hard", "Remove-Item -Recurse", "rd /s /q", "drop database"],
      },
      {
        id: "bash-high-risk-pattern-approval",
        tool: "bash",
        action: "require_approval",
        risk: "high",
        reason: "interpreter, nested shell, and remote execution patterns require approval",
        commandPrefixes: [
          "python -c",
          "python3 -c",
          "node -e",
          "bash -lc",
          "sh -c",
          "pwsh -command",
          "powershell -command",
          "cmd /c",
          "ssh ",
        ],
      },
      {
        id: "write-file-approval",
        tool: "write_file",
        action: "require_approval",
        risk: "medium",
        reason: "write operation requires approval by default",
      },
      {
        id: "edit-file-approval",
        tool: "edit_file",
        action: "require_approval",
        risk: "medium",
        reason: "edit operation requires approval by default",
      },
      {
        id: "background-run-approval",
        tool: "background_run",
        action: "require_approval",
        risk: "high",
        reason: "background shell execution requires approval",
      },
      {
        id: "mcp-tool-approval",
        toolPrefix: "mcp__",
        action: "require_approval",
        risk: "medium",
        reason: "external mcp tool requires approval by default",
      },
    ],
  };
}

export function mergeSecurityPolicy(parsed: PolicyConfig, defaults = defaultSecurityPolicy()): PolicyConfig {
  const loadedRules = Array.isArray(parsed.rules) ? parsed.rules : defaults.rules;
  const knownIds = new Set(loadedRules.map((rule) => rule.id));
  const mergedRules = [...loadedRules];
  for (const rule of defaults.rules) {
    if (!knownIds.has(rule.id)) {
      mergedRules.push(rule);
    }
  }
  return {
    schemaVersion: Number.isFinite(Number(parsed.schemaVersion)) ? Number(parsed.schemaVersion) : defaults.schemaVersion,
    rules: mergedRules,
  };
}

export function matchSecurityRule(rule: PolicyRule, input: PolicyInput): boolean {
  const matchesExact = Boolean(rule.tool) && rule.tool === input.toolName;
  const matchesPrefix = Boolean(rule.toolPrefix) && input.toolName.startsWith(String(rule.toolPrefix));
  if (!matchesExact && !matchesPrefix) {
    return false;
  }
  if (rule.commandIncludes && rule.commandIncludes.length > 0) {
    const cmd = String(input.args.command ?? "");
    if (!rule.commandIncludes.some((snippet) => cmd.includes(snippet))) {
      return false;
    }
  }
  if (rule.commandPrefixes && rule.commandPrefixes.length > 0) {
    const cmd = String(input.args.command ?? "").trim().toLowerCase();
    if (!rule.commandPrefixes.some((prefix) => cmd.startsWith(prefix.toLowerCase()))) {
      return false;
    }
  }
  if (rule.pathPrefixes && rule.pathPrefixes.length > 0) {
    const targetPath = String(input.args.path ?? "");
    if (!rule.pathPrefixes.some((prefix) => targetPath.startsWith(prefix))) {
      return false;
    }
  }
  return true;
}

export function evaluateSecurityPolicy(policy: PolicyConfig, input: PolicyInput): PolicyDecision {
  const matched = policy.rules.find((rule) => matchSecurityRule(rule, input));
  const scope = buildScopePreview(input.toolName, input.args);
  const scopeHash = stableScopeHash(input.toolName, input.args);
  if (matched) {
    return {
      decision: matched.action,
      risk: matched.risk,
      reason: matched.reason,
      matchedRule: matched.id,
      scope,
      scopeHash,
    };
  }
  return {
    decision: "allow",
    risk: "low",
    reason: "default allow",
    matchedRule: "default-allow",
    scope,
    scopeHash,
  };
}
