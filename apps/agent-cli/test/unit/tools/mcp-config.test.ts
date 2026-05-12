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
  await writeFile(path.join(workspaceDir, ".codex", "mcp.json"), `${JSON.stringify(content, null, 2)}\n`, "utf8");
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
          command: "node",
          args: ["server.mjs", 42],
          env: { TOKEN: 123, EMPTY: null },
          cwd: "nested",
          requestTimeoutMs: 250.9,
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
        command: "node",
        args: ["server.mjs", "42"],
        env: { TOKEN: "123", EMPTY: "" },
        cwd: path.resolve(process.cwd(), "nested"),
        enabled: true,
        requestTimeoutMs: 250,
      },
    ]);
  });

  it("uses the runtime default timeout when overrides are too small", async () => {
    await writeConfig({
      servers: [{ name: "demo", command: "node", requestTimeoutMs: 50 }],
    });

    expect((await loadMcpServerConfigs())[0]?.requestTimeoutMs).toBe(RUNTIME_CONFIG.mcpRequestTimeoutMs);
  });
});
