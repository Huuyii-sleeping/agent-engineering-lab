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
});
