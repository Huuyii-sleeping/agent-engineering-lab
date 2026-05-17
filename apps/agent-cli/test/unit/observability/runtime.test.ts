import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { readObservabilityEvents, recordObservabilityEvent } from "../../../src/observability/runtime.js";

let tempDir = "";
let previousCwd = "";

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

async function withWorkspace(): Promise<void> {
  tempDir = await mkdtemp(path.join(tmpdir(), "observability-runtime-test-"));
  previousCwd = process.cwd();
  process.chdir(tempDir);
}

describe("observability/runtime", () => {
  it("redacts sensitive payloads and hides mcp identifiers before persistence", async () => {
    await withWorkspace();

    await recordObservabilityEvent("tool_result", {
      toolName: "mcp__private_demo__echo",
      outputSummary: "authorization=Bearer top-secret-token",
      nested: {
        serverName: "private-demo",
        remoteTool: "echo",
        text: "api_key=super-secret",
      },
    });

    const raw = await readFile(path.join(process.cwd(), ".observability", "events.jsonl"), "utf8");
    const events = await readObservabilityEvents();

    expect(raw).toContain("[mcp_tool]");
    expect(raw).toContain("[REDACTED_SECRET]");
    expect(raw).not.toContain("private_demo");
    expect(raw).not.toContain("top-secret-token");
    expect(events[0]?.payload.toolName).toBe("[mcp_tool]");
  });

  it("skips local observability persistence completely when privacy mode is disabled", async () => {
    const previous = process.env.AGENT_PRIVACY_OBSERVABILITY_MODE;
    process.env.AGENT_PRIVACY_OBSERVABILITY_MODE = "disabled";
    try {
      await withWorkspace();

      await recordObservabilityEvent("tool_result", {
        toolName: "write_file",
        ok: true,
      });

      await expect(readFile(path.join(process.cwd(), ".observability", "events.jsonl"), "utf8")).rejects.toBeTruthy();
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_PRIVACY_OBSERVABILITY_MODE;
      } else {
        process.env.AGENT_PRIVACY_OBSERVABILITY_MODE = previous;
      }
    }
  });

  it("keeps only essential observability records in minimal mode", async () => {
    const previous = process.env.AGENT_PRIVACY_OBSERVABILITY_MODE;
    process.env.AGENT_PRIVACY_OBSERVABILITY_MODE = "minimal";
    try {
      await withWorkspace();

      await recordObservabilityEvent("tool_result", {
        toolName: "write_file",
        ok: true,
      });
      await recordObservabilityEvent("security_blocked", {
        toolName: "bash",
        reason: "approval required",
      });

      const raw = await readFile(path.join(process.cwd(), ".observability", "events.jsonl"), "utf8");
      expect(raw).not.toContain("tool_result");
      expect(raw).toContain("security_blocked");
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_PRIVACY_OBSERVABILITY_MODE;
      } else {
        process.env.AGENT_PRIVACY_OBSERVABILITY_MODE = previous;
      }
    }
  });
});
