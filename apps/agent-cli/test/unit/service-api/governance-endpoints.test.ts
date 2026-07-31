import { Mastra } from "@mastra/core/mastra";
import type { RuntimeGateway } from "@orbit/runtime-contracts";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { createNestAgentHttpServer } from "../../../src/nest/server.js";
import type { AgentService } from "../../../src/service-api/index.js";
import type { AgentServerLike } from "../../../src/service-api/server.js";

let tempDir = "";
let previousCwd = "";
const servers: AgentServerLike[] = [];

async function enterWorkspace(): Promise<void> {
  tempDir = path.join(tmpdir(), `agent-service-governance-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tempDir, { recursive: true });
  previousCwd = process.cwd();
  process.chdir(tempDir);
}

async function listen(server: AgentServerLike): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("server did not bind to a TCP port");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function requestJson(baseUrl: string, pathname: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(new URL(pathname, baseUrl));
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
  if (previousCwd) {
    process.chdir(previousCwd);
    previousCwd = "";
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

describe("service-api governance endpoints", () => {
  it("returns bounded audit events and tracked security findings for BFF read APIs", async () => {
    await enterWorkspace();
    await mkdir(path.join(tempDir, ".audit"), { recursive: true });
    await mkdir(path.join(tempDir, ".security"), { recursive: true });
    await writeFile(
      path.join(tempDir, ".audit", "events.jsonl"),
      `${JSON.stringify({
        schemaVersion: 1,
        id: "aud1",
        at: Date.now(),
        expiresAt: Date.now() + 86_400_000,
        category: "security",
        action: "secret_scan_finding",
        outcome: "blocked",
        subject: "bash",
        summary: "secret scan finding",
        sessionId: "session_1",
        traceId: "trace_1",
        metadata: {},
      })}\n`,
      "utf8",
    );
    await writeFile(
      path.join(tempDir, ".security", "secret-findings.json"),
      `${JSON.stringify(
        [
          {
            schemaVersion: 1,
            id: "sf1",
            createdAt: Date.now(),
            sourceKind: "tool_output",
            toolName: "bash",
            ruleId: "openai-api-key",
            action: "block",
            severity: "high",
            summary: "OpenAI-style API key detected",
            preview: "[REDACTED_SECRET]",
            fingerprint: "fingerprint",
          },
        ],
        null,
        2,
      )}\n`,
      "utf8",
    );

    const runtimeGateway = {
      agent: {},
      workflow: {},
      tools: {},
      memory: {},
    } as RuntimeGateway;
    const service = {
      runtimeGateway,
      workflowRuntime: runtimeGateway.workflow,
      runtimeInfo: async () => ({ mode: "mastra-only" }),
      bridgeManifest: () => ({ name: "agent-cli-bridge" }),
    } as unknown as AgentService;
    const baseUrl = await listen(await createNestAgentHttpServer(service, { mastra: new Mastra({}) }));

    await expect(requestJson(baseUrl, "/audit/events?limit=1&session_id=session_1&category=security")).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        events: [{ id: "aud1", category: "security", sessionId: "session_1" }],
      },
    });
    await expect(requestJson(baseUrl, "/security/findings")).resolves.toMatchObject({
      status: 200,
      body: {
        ok: true,
        findings: [{ id: "sf1", ruleId: "openai-api-key" }],
      },
    });

    await expect(readFile(path.join(tempDir, ".security", "secret-findings.json"), "utf8")).resolves.toContain("sf1");
  });
});
