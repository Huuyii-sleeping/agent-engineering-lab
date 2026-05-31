import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RUNTIME_CONFIG } from "../../../src/runtime-config.js";
import { loadMcpServerConfigs } from "../../../src/tools/mcp-config.js";

let workspaceDir = "";
let previousCwd = "";

async function writeConfig(content: unknown): Promise<void> {
  await mkdir(path.join(workspaceDir, ".codex"), { recursive: true });
  await writeFile(
    path.join(workspaceDir, ".codex", "mcp.json"),
    `${JSON.stringify(content, null, 2)}\n`,
    "utf8",
  );
}

describe("tools/mcp-config", () => {
  beforeEach(async () => {
    previousCwd = process.cwd();
    workspaceDir = await mkdtemp(path.join(tmpdir(), "mcp-config-test-"));
    process.chdir(workspaceDir);
  });

  afterEach(async () => {
    if (previousCwd) {
      process.chdir(previousCwd);
    }
    if (workspaceDir) {
      await rm(workspaceDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("returns no servers when config is absent or invalid", async () => {
    expect(await loadMcpServerConfigs()).toEqual([]);

    await mkdir(path.join(workspaceDir, ".codex"), { recursive: true });
    await writeFile(path.join(workspaceDir, ".codex", "mcp.json"), "{not-json", "utf8");

    expect(await loadMcpServerConfigs()).toEqual([]);
  });

  it("normalizes enabled server configs and filters invalid entries", async () => {
    await writeConfig({
      schemaVersion: 1,
      servers: [
        {
          name: " demo ",
          command: "tsx",
          args: ["server.ts", 42],
          env: { TOKEN: 123, EMPTY: null },
          cwd: "nested",
          trusted: true,
          startupTimeoutMs: 500.7,
          requestTimeoutMs: 250.9,
          allowedTools: ["Echo_Upper", "echo_upper", 7],
          disabledTools: "Fail_Now, fail_now",
          maxConcurrentCalls: 2.9,
        },
        {
          name: "disabled",
          command: "node",
          enabled: false,
        },
        {
          name: "missing-command",
        },
      ],
    });

    expect(await loadMcpServerConfigs()).toEqual([
      {
        name: "demo",
        command: "tsx",
        args: ["server.ts", "42"],
        env: { TOKEN: "123", EMPTY: "" },
        cwd: path.resolve(process.cwd(), "nested"),
        enabled: true,
        trusted: true,
        provenance: `${path.join(process.cwd(), ".codex", "mcp.json")}#demo`,
        credentialMode: "configured",
        startupTimeoutMs: 500,
        requestTimeoutMs: 250,
        allowedTools: ["echo_upper", "7"],
        disabledTools: ["fail_now"],
        maxConcurrentCalls: 2,
      },
    ]);
  });

  it("uses runtime default request timeout and no startup override when overrides are too small", async () => {
    await writeConfig({
      servers: [
        { name: "demo", command: "node", trusted: true, startupTimeoutMs: 50, requestTimeoutMs: 50 },
      ],
    });

    expect(await loadMcpServerConfigs()).toEqual([
      expect.objectContaining({
        startupTimeoutMs: undefined,
        requestTimeoutMs: RUNTIME_CONFIG.mcpRequestTimeoutMs,
      }),
    ]);
  });

  it("defaults servers to untrusted until the config opts in", async () => {
    await writeConfig({
      servers: [{ name: "demo", command: "node" }],
    });

    expect((await loadMcpServerConfigs())[0]).toMatchObject({
      name: "demo",
      trusted: false,
      credentialMode: "none",
    });
  });

  it("returns no external servers when privacy mode disables external capabilities", async () => {
    const previous = process.env.AGENT_PRIVACY_EXTERNAL_CAPABILITIES_MODE;
    process.env.AGENT_PRIVACY_EXTERNAL_CAPABILITIES_MODE = "disabled";
    try {
      await writeConfig({
        servers: [{ name: "demo", command: "node", trusted: true }],
      });

      expect(await loadMcpServerConfigs()).toEqual([]);
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_PRIVACY_EXTERNAL_CAPABILITIES_MODE;
      } else {
        process.env.AGENT_PRIVACY_EXTERNAL_CAPABILITIES_MODE = previous;
      }
    }
  });

  it("filters configured servers through the explicit allowlist privacy mode", async () => {
    const previousMode = process.env.AGENT_PRIVACY_EXTERNAL_CAPABILITIES_MODE;
    const previousAllowlist = process.env.AGENT_PRIVACY_MCP_ALLOWLIST;
    process.env.AGENT_PRIVACY_EXTERNAL_CAPABILITIES_MODE = "allowlist";
    process.env.AGENT_PRIVACY_MCP_ALLOWLIST = "demo-two";
    try {
      await writeConfig({
        servers: [
          { name: "demo-one", command: "node", trusted: true },
          { name: "demo-two", command: "node", trusted: true },
        ],
      });

      expect((await loadMcpServerConfigs()).map((item) => item.name)).toEqual(["demo-two"]);
    } finally {
      if (previousMode === undefined) {
        delete process.env.AGENT_PRIVACY_EXTERNAL_CAPABILITIES_MODE;
      } else {
        process.env.AGENT_PRIVACY_EXTERNAL_CAPABILITIES_MODE = previousMode;
      }
      if (previousAllowlist === undefined) {
        delete process.env.AGENT_PRIVACY_MCP_ALLOWLIST;
      } else {
        process.env.AGENT_PRIVACY_MCP_ALLOWLIST = previousAllowlist;
      }
    }
  });
});
