import path from "node:path";
import * as process from "node:process";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, it } from "vitest";
import type { McpServerConfig } from "../../../src/tools/mcp-config.js";
import { McpRegistry } from "../../../src/tools/mcp-registry.js";

const fixtureServerPath = path.resolve(process.cwd(), "test/fixtures/mcp-demo-server.ts");
const tsxCliPath = path.resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs");
let activeRegistry: McpRegistry | null = null;
let cleanupPaths: string[] = [];

function createRegistry(input: { env?: Record<string, string> } = {}): McpRegistry {
  const config: McpServerConfig = {
    name: "demo",
    command: process.execPath,
    args: [tsxCliPath, fixtureServerPath],
    env: input.env ?? {},
    cwd: process.cwd(),
    enabled: true,
    trusted: true,
    provenance: `${path.join(process.cwd(), ".codex", "mcp.json")}#demo`,
    credentialMode: "none",
    requestTimeoutMs: 2000,
    allowedTools: [],
    disabledTools: [],
    maxConcurrentCalls: 4,
  };
  activeRegistry = new McpRegistry([config]);
  return activeRegistry;
}

describe("tools/mcp-registry", () => {
  afterEach(async () => {
    await activeRegistry?.close();
    await Promise.all(cleanupPaths.map((item) => rm(item, { force: true }).catch(() => undefined)));
    activeRegistry = null;
    cleanupPaths = [];
  });

  it("builds cached mcp registrations and OpenAI tool schemas", async () => {
    const registry = createRegistry();

    const registrations = await registry.listRegistrations();
    const tools = await registry.listTools();

    expect(registrations).toContainEqual(
      expect.objectContaining({
        name: "mcp__demo__echo_upper",
        serverName: "demo",
        remoteName: "echo_upper",
        target: "mcp",
        trust: "trusted",
        provenance: `${path.join(process.cwd(), ".codex", "mcp.json")}#demo`,
        credentialMode: "none",
      }),
    );
    expect(tools).toContainEqual(
      expect.objectContaining({
        type: "function",
        function: expect.objectContaining({
          name: "mcp__demo__echo_upper",
          description: "[mcp:demo] Uppercase an input string. token=[REDACTED_SECRET]",
        }),
      }),
    );
  });

  it("keeps untrusted mcp servers out of the executable tool set", async () => {
    const config: McpServerConfig = {
      name: "demo",
      command: process.execPath,
      args: [tsxCliPath, fixtureServerPath],
      env: { TOKEN: "super-secret" },
      cwd: process.cwd(),
      enabled: true,
      trusted: false,
      provenance: `${path.join(process.cwd(), ".codex", "mcp.json")}#demo`,
      credentialMode: "configured",
      requestTimeoutMs: 2000,
      allowedTools: [],
      disabledTools: [],
      maxConcurrentCalls: 4,
    };
    activeRegistry = new McpRegistry([config]);

    expect(await activeRegistry.listRegistrations()).toEqual([]);
    expect(await activeRegistry.run("mcp__demo__echo_upper", { text: "hello" })).toBeNull();
  });

  it("filters remote registrations through configured tool allow and deny lists", async () => {
    const config: McpServerConfig = {
      name: "demo",
      command: process.execPath,
      args: [tsxCliPath, fixtureServerPath],
      env: {},
      cwd: process.cwd(),
      enabled: true,
      trusted: true,
      provenance: `${path.join(process.cwd(), ".codex", "mcp.json")}#demo`,
      credentialMode: "none",
      requestTimeoutMs: 2000,
      allowedTools: ["echo_upper", "fail_now"],
      disabledTools: ["fail_now"],
      maxConcurrentCalls: 4,
    };
    activeRegistry = new McpRegistry([config]);

    expect((await activeRegistry.listRegistrations()).map((tool) => tool.remoteName)).toEqual(["echo_upper"]);
  });

  it("serializes calls when the server concurrency limit is one", async () => {
    const config: McpServerConfig = {
      name: "demo",
      command: process.execPath,
      args: [tsxCliPath, fixtureServerPath],
      env: {},
      cwd: process.cwd(),
      enabled: true,
      trusted: true,
      provenance: `${path.join(process.cwd(), ".codex", "mcp.json")}#demo`,
      credentialMode: "none",
      requestTimeoutMs: 2000,
      allowedTools: [],
      disabledTools: [],
      maxConcurrentCalls: 1,
    };
    activeRegistry = new McpRegistry([config]);
    await activeRegistry.listRegistrations();

    const start = performance.now();
    const [first, second] = await Promise.all([
      activeRegistry.run("mcp__demo__delay_echo", { text: "a", delayMs: 60 }),
      activeRegistry.run("mcp__demo__delay_echo", { text: "b", delayMs: 60 }),
    ]);

    expect(performance.now() - start).toBeGreaterThanOrEqual(100);
    expect(JSON.parse(first ?? "{}").echoed).toBe("a");
    expect(JSON.parse(second ?? "{}").echoed).toBe("b");
  });

  it("classifies authentication failures and caches them per server", async () => {
    const registry = createRegistry();
    await registry.listRegistrations();

    const first = JSON.parse((await registry.run("mcp__demo__auth_fail", {})) ?? "{}") as {
      ok?: boolean;
      error?: { code?: string };
    };
    const second = JSON.parse((await registry.run("mcp__demo__echo_upper", { text: "hello" })) ?? "{}") as {
      ok?: boolean;
      error?: { code?: string };
    };

    expect(first.ok).toBe(false);
    expect(first.error?.code).toBe("MCP_AUTH_REQUIRED");
    expect(second.ok).toBe(false);
    expect(second.error?.code).toBe("MCP_AUTH_REQUIRED");
  });

  it("recovers from a session-expired error by reconnecting and retrying once", async () => {
    const markerPath = path.join(
      tmpdir(),
      `agent-cli-mcp-expire-once-${process.pid}-${Date.now()}.marker`,
    );
    cleanupPaths.push(markerPath);
    const registry = createRegistry({ env: { MCP_DEMO_EXPIRE_ONCE_MARKER: markerPath } });
    await registry.listRegistrations();

    const output = JSON.parse((await registry.run("mcp__demo__expire_once", { text: "ok" })) ?? "{}") as {
      ok?: boolean;
      recovered?: boolean;
      echoed?: string;
    };

    expect(output.ok).toBe(true);
    expect(output.recovered).toBe(true);
    expect(output.echoed).toBe("ok");
  });

  it("reports registry status and clears cached auth failures", async () => {
    const registry = createRegistry();
    await registry.listRegistrations();
    await registry.run("mcp__demo__auth_fail", {});

    expect(registry.getStatus()).toContainEqual(
      expect.objectContaining({
        name: "demo",
        trusted: true,
        toolCount: 5,
        authFailed: true,
        maxConcurrentCalls: 4,
      }),
    );

    expect(registry.resetAuthFailures()).toEqual({ cleared: 1 });
    expect(registry.getStatus()[0]?.authFailed).toBe(false);
  });

  it("runs matching mcp tools and keeps missing aliases as null", async () => {
    const registry = createRegistry();

    const output = JSON.parse(
      (await registry.run("mcp__demo__echo_upper", { text: "hello" })) ?? "{}",
    ) as {
      ok?: boolean;
      echoed?: string;
      secret?: string;
      hidden?: string;
    };

    expect(output.ok).toBe(true);
    expect(output.echoed).toBe("HELLO");
    expect(output.secret).toBe("token=[REDACTED_SECRET]");
    expect(output.hidden).toBe("visibletext");
    expect(await registry.run("mcp__demo__missing", {})).toBeNull();
  });

  it("normalizes remote tool failures without throwing", async () => {
    const registry = createRegistry();

    const output = JSON.parse(
      (await registry.run("mcp__demo__fail_now", { reason: "fixture boom" })) ?? "{}",
    ) as {
      ok?: boolean;
      error?: { code?: string; message?: string };
    };

    expect(output.ok).toBe(false);
    expect(output.error?.code).toBe("MCP_TOOL_CALL_FAILED");
    expect(output.error?.message).toBe("fixture boom");
  });
});
