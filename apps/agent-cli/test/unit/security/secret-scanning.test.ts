import { describe, expect, it } from "vitest";
import { scanTextForSecrets } from "../../../src/security/secret-scanning.js";

describe("security/secret-scanning", () => {
  it("classifies high-confidence secrets as block findings", () => {
    const result = scanTextForSecrets({
      content: "OPENAI_API_KEY=sk-123456789012345678901234",
      sourceKind: "tool_output",
      toolName: "bash",
    });

    expect(result.action).toBe("block");
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "block",
          ruleId: "openai-api-key",
          sourceKind: "tool_output",
        }),
      ]),
    );
    expect(result.redactedText).toContain("[REDACTED_SECRET]");
    expect(result.redactedText).not.toContain("sk-123456789012345678901234");
  });

  it("classifies secret assignments as warn findings", () => {
    const result = scanTextForSecrets({
      content: 'const API_KEY = "placeholder-dev-token-123456";',
      sourceKind: "workspace_write",
      targetPath: "tmp/warn.ts",
    });

    expect(result.action).toBe("warn");
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "warn",
          ruleId: "generic-secret-assignment",
          sourceKind: "workspace_write",
          targetPath: "tmp/warn.ts",
        }),
      ]),
    );
  });

  it("classifies low-confidence secret hints as audit-only findings", () => {
    const result = scanTextForSecrets({
      content: "Remember to configure API_KEY before release.",
      sourceKind: "delivery_validation",
      targetPath: "README.md",
    });

    expect(result.action).toBe("audit_only");
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "audit_only",
          ruleId: "secret-hint",
          sourceKind: "delivery_validation",
        }),
      ]),
    );
  });
});
