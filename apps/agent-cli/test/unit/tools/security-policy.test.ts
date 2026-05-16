import { describe, expect, it } from "vitest";
import {
  defaultSecurityPolicy,
  evaluateSecurityPolicy,
  mergeSecurityPolicy,
} from "../../../src/tools/security-policy.js";
import type { PolicyConfig } from "../../../src/tools/security-types.js";

describe("tools/security-policy", () => {
  it("keeps default deny and approval decisions stable", () => {
    const policy = defaultSecurityPolicy();

    expect(evaluateSecurityPolicy(policy, { toolName: "bash", args: { command: "rm -rf /" } })).toMatchObject({
      decision: "deny",
      risk: "critical",
      matchedRule: "bash-critical-deny",
    });
    expect(
      evaluateSecurityPolicy(policy, { toolName: "bash", args: { command: "git reset --hard HEAD" } }),
    ).toMatchObject({
      decision: "require_approval",
      risk: "high",
      matchedRule: "bash-high-approval",
    });
    expect(evaluateSecurityPolicy(policy, { toolName: "bash", args: { command: "python -c \"print(1)\"" } })).toMatchObject({
      decision: "require_approval",
      risk: "high",
      matchedRule: "bash-high-risk-pattern-approval",
    });
    expect(evaluateSecurityPolicy(policy, { toolName: "bash", args: { command: "ssh prod.example hostname" } })).toMatchObject({
      decision: "require_approval",
      risk: "high",
      matchedRule: "bash-high-risk-pattern-approval",
    });
    expect(evaluateSecurityPolicy(policy, { toolName: "mcp__demo__echo", args: { text: "hello" } })).toMatchObject({
      decision: "require_approval",
      risk: "medium",
      matchedRule: "mcp-tool-approval",
    });
    expect(evaluateSecurityPolicy(policy, { toolName: "read_file", args: { path: "README.md" } })).toMatchObject({
      decision: "allow",
      risk: "low",
      matchedRule: "default-allow",
    });
  });

  it("preserves loaded rules and appends missing default rules", () => {
    const loaded: PolicyConfig = {
      schemaVersion: 7,
      rules: [
        {
          id: "write-file-approval",
          tool: "write_file",
          action: "deny",
          risk: "critical",
          reason: "custom deny",
        },
      ],
    };

    const merged = mergeSecurityPolicy(loaded);

    expect(merged.schemaVersion).toBe(7);
    expect(merged.rules[0]).toMatchObject({ id: "write-file-approval", action: "deny", reason: "custom deny" });
    expect(merged.rules.map((rule) => rule.id)).toContain("bash-critical-deny");
    expect(merged.rules.filter((rule) => rule.id === "write-file-approval")).toHaveLength(1);
  });
});
