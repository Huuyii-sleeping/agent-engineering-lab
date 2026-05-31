import path from "node:path";
import * as process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import type { McpServerConfig } from "../../../src/tools/mcp-config.js";
import { McpServerClient } from "../../../src/tools/mcp-client.js";

const fixtureServerPath = path.resolve(process.cwd(), "test/fixtures/mcp-demo-server.ts");
const tsxCliPath = path.resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs");
const MCP_SUBPROCESS_TEST_TIMEOUT_MS = 20_000;
const MCP_FIXTURE_REQUEST_TIMEOUT_MS = 20_000;
let activeClient: McpServerClient | null = null;

function createConfig(): McpServerConfig {
  return {
    name: "demo",
    command: process.execPath,
    args: [tsxCliPath, fixtureServerPath],
    env: {},
    cwd: process.cwd(),
    enabled: true,
    trusted: true,
    provenance: `${path.join(process.cwd(), ".codex", "mcp.json")}#demo`,
    credentialMode: "none",
    startupTimeoutMs: MCP_FIXTURE_REQUEST_TIMEOUT_MS,
    requestTimeoutMs: MCP_FIXTURE_REQUEST_TIMEOUT_MS,
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
  }, MCP_SUBPROCESS_TEST_TIMEOUT_MS);

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
  }, MCP_SUBPROCESS_TEST_TIMEOUT_MS);
});
