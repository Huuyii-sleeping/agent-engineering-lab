import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const fixtureServerPath = path.resolve(process.cwd(), "test/fixtures/mcp-demo-server.ts");
const tsxCliPath = path.resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs");
let workspaceDir = "";
let previousCwd = "";

async function writeMcpConfig(dir: string): Promise<void> {
  process.chdir(dir);
  await mkdir(path.join(process.cwd(), ".codex"), { recursive: true });
  await writeFile(
    path.join(process.cwd(), ".codex", "mcp.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        servers: [
          {
            name: "demo",
            command: process.execPath,
            args: [tsxCliPath, fixtureServerPath],
            trusted: true,
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

beforeAll(async () => {
  workspaceDir = await mkdtemp(path.join(tmpdir(), "mcp-test-"));
  previousCwd = process.cwd();
  await writeMcpConfig(workspaceDir);
});

afterAll(async () => {
  try {
    const mcpModule = await import("../../src/tools/mcp.js");
    await mcpModule.resetMcpRegistryForTest();
  } catch {
    // ignore reset failures
  }
  if (previousCwd) {
    process.chdir(previousCwd);
  }
  if (workspaceDir) {
    await rm(workspaceDir, { recursive: true, force: true }).catch(() => {});
  }
});

describe("mcp capability bus", () => {
  it("loads configured tools and executes approved mcp calls", async () => {
    const toolsModule = await import("../../src/tools/index.js");
    const securityModule = await import("../../src/tools/security.js");
    const mcpModule = await import("../../src/tools/mcp.js");

    const tools = await toolsModule.listTools();
    const names = tools
      .filter(
        (tool): tool is Extract<(typeof tools)[number], { type: "function" }> =>
          tool.type === "function",
      )
      .map((tool) => tool.function.name);
    expect(names).toContain("mcp__demo__echo_upper");

    const registrations = await mcpModule.listMcpToolRegistrations();
    const echoRegistration = registrations.find((tool) => tool.name === "mcp__demo__echo_upper");
    expect(echoRegistration?.target).toBe("mcp");
    expect(echoRegistration?.serverName).toBe("demo");
    expect(echoRegistration?.remoteName).toBe("echo_upper");
    expect(echoRegistration?.trust).toBe("trusted");
    expect(String(echoRegistration?.provenance ?? "")).toContain(".codex");
    expect(echoRegistration?.credentialMode).toBe("none");

    const blocked = JSON.parse(
      await toolsModule.runToolByName("mcp__demo__echo_upper", '{"text":"hello"}'),
    ) as {
      ok?: boolean;
      error?: { code?: string };
    };
    expect(blocked.ok).toBe(false);
    expect(blocked.error?.code).toBe("SECURITY_APPROVAL_REQUIRED");

    const approval = JSON.parse(
      await securityModule.runSecurityRequestApproval("mcp__demo__echo_upper", '{"text":"hello"}'),
    ) as { request?: { request_id?: string } };
    expect(approval.request?.request_id).toBeTruthy();
    await securityModule.runSecurityApprove(approval.request?.request_id);

    const output = JSON.parse(
      await toolsModule.runToolByName("mcp__demo__echo_upper", '{"text":"hello"}'),
    ) as {
      ok?: boolean;
      echoed?: string;
      secret?: string;
    };
    expect(output.ok).toBe(true);
    expect(output.echoed).toBe("HELLO");
    expect(output.secret).toBe("token=[REDACTED_SECRET]");
  });

  it("returns structured failures and observability events for mcp tool errors", async () => {
    const toolsModule = await import("../../src/tools/index.js");
    const securityModule = await import("../../src/tools/security.js");
    const observabilityModule = await import("../../src/observability/runtime.js");

    const approval = JSON.parse(
      await securityModule.runSecurityRequestApproval(
        "mcp__demo__fail_now",
        '{"reason":"fixture boom"}',
      ),
    ) as { request?: { request_id?: string } };
    await securityModule.runSecurityApprove(approval.request?.request_id);

    const output = JSON.parse(
      await toolsModule.runToolByName("mcp__demo__fail_now", '{"reason":"fixture boom"}'),
    ) as {
      ok?: boolean;
      error?: { code?: string; message?: string };
    };
    expect(output.ok).toBe(false);
    expect(output.error?.code).toBe("MCP_TOOL_CALL_FAILED");
    expect(output.error?.message).toContain("fixture boom");

    const events = await observabilityModule.readObservabilityEvents();
    expect(
      events.some(
        (event) =>
          event.kind === "mcp_call" &&
          event.payload.toolName === "[mcp_tool]" &&
          event.payload.ok === false,
      ),
    ).toBe(true);
  });
});
