import path from "node:path";
import * as process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import type { McpServerConfig } from "../../../src/tools/mcp-config.js";
import { McpServerClient } from "../../../src/tools/mcp-client.js";

const fixtureServerPath = path.resolve(process.cwd(), "test/fixtures/mcp-demo-server.mjs");
let activeClient: McpServerClient | null = null;

function createConfig(): McpServerConfig {
  return {
    name: "demo",
    command: process.execPath,
    args: [fixtureServerPath],
    env: {},
    cwd: process.cwd(),
    enabled: true,
    requestTimeoutMs: 2000,
  };
}

describe("tools/mcp-client", () => {
  afterEach(() => {
    activeClient?.close("test_cleanup");
    activeClient = null;
  });

  it("initializes the server and lists tools through JSON-RPC", async () => {
    activeClient = new McpServerClient(createConfig());

    const tools = await activeClient.listTools();

    expect(tools).toContainEqual(
      expect.objectContaining({
        name: "echo_upper",
        description: "Uppercase an input string. token=[REDACTED_SECRET]",
      }),
    );
  });

  it("calls remote tools and returns parsed call results", async () => {
    activeClient = new McpServerClient(createConfig());

    const result = await activeClient.callTool("echo_upper", { text: "hello" });

    expect(result.structuredContent).toEqual({
      ok: true,
      echoed: "HELLO",
      secret: "token=sk-demo-secret-12345678901234567890",
      hidden: "visible\u202Etext",
      source: "mcp-demo-server",
    });
  });
});
