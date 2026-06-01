import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { readAuditEvents } from "../../../src/audit/runtime.js";
import { reportSecretScan, scanTextForSecrets } from "../../../src/security/secret-scanning.js";

let tempDir = "";
let previousCwd = "";

async function withWorkspace(): Promise<void> {
  tempDir = await mkdtemp(path.join(tmpdir(), "secret-scan-audit-test-"));
  previousCwd = process.cwd();
  process.chdir(tempDir);
}

afterEach(async () => {
  if (previousCwd) {
    process.chdir(previousCwd);
    previousCwd = "";
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

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

  it("writes normalized audit events for reported secret findings", async () => {
    await withWorkspace();
    const scan = scanTextForSecrets({
      content: "OPENAI_API_KEY=sk-123456789012345678901234",
      sourceKind: "tool_output",
      toolName: "bash",
    });

    await reportSecretScan({
      sourceKind: "tool_output",
      action: "block",
      findings: scan.findings,
      toolName: "bash",
      traceId: "trace-secret-audit",
    });

    const events = await readAuditEvents({ category: "security" });
    expect(events).toMatchObject([
      {
        action: "secret_scan_finding",
        outcome: "blocked",
        subject: "bash",
        traceId: "trace-secret-audit",
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("sk-123456789012345678901234");
  });
});
