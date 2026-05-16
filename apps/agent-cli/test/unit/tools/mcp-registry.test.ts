import path from "node:path";
import * as process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import type { McpServerConfig } from "../../../src/tools/mcp-config.js";
import { McpRegistry } from "../../../src/tools/mcp-registry.js";

const fixtureServerPath = path.resolve(process.cwd(), "test/fixtures/mcp-demo-server.mjs");
let activeRegistry: McpRegistry | null = null;

function createRegistry(): McpRegistry {
  const config: McpServerConfig = {
    name: "demo",
    command: process.execPath,
    args: [fixtureServerPath],
    env: {},
    cwd: process.cwd(),
    enabled: true,
    requestTimeoutMs: 2000,
  };
  activeRegistry = new McpRegistry([config]);
  return activeRegistry;
}

describe("tools/mcp-registry", () => {
  afterEach(async () => {
    await activeRegistry?.close();
    activeRegistry = null;
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

  it("runs matching mcp tools and keeps missing aliases as null", async () => {
    const registry = createRegistry();

    const output = JSON.parse((await registry.run("mcp__demo__echo_upper", { text: "hello" })) ?? "{}") as {
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

    const output = JSON.parse((await registry.run("mcp__demo__fail_now", { reason: "fixture boom" })) ?? "{}") as {
      ok?: boolean;
      error?: { code?: string; message?: string };
    };

    expect(output.ok).toBe(false);
    expect(output.error?.code).toBe("MCP_TOOL_CALL_FAILED");
    expect(output.error?.message).toBe("fixture boom");
  });
});
