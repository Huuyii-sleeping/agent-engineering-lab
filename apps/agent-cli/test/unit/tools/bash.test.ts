import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { runBash } from "../../../src/tools/bash.js";

let tempDir = "";
let previousCwd = "";
const originalSandboxMode = process.env.AGENT_BASH_SANDBOX_MODE;

afterEach(async () => {
  if (previousCwd) {
    process.chdir(previousCwd);
    previousCwd = "";
  }
  delete process.env.GIT_DIR;
  delete process.env.GIT_WORK_TREE;
  delete process.env.BASH_ENV;
  if (originalSandboxMode === undefined) {
    delete process.env.AGENT_BASH_SANDBOX_MODE;
  } else {
    process.env.AGENT_BASH_SANDBOX_MODE = originalSandboxMode;
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

async function withTempWorkspace(): Promise<string> {
  tempDir = await mkdtemp(path.join(tmpdir(), "bash-tool-test-"));
  previousCwd = process.cwd();
  process.chdir(tempDir);
  return tempDir;
}

describe("tools/bash", () => {
  it("blocks obvious write commands in strict-readonly sandbox mode", async () => {
    await withTempWorkspace();
    process.env.AGENT_BASH_SANDBOX_MODE = "strict-readonly";

    const output = await runBash("touch blocked.txt");
    const parsed = JSON.parse(output) as { ok?: boolean; error?: { code?: string } };

    expect(parsed.ok).toBe(false);
    expect(parsed.error?.code).toBe("SANDBOX_READONLY_VIOLATION");
  });

  it("allows read-only commands through strict-readonly sandbox mode", async () => {
    await withTempWorkspace();
    process.env.AGENT_BASH_SANDBOX_MODE = "strict-readonly";

    const output = await runBash('node -e "console.log(\'read ok\')"');

    expect(output).toBe("read ok");
  });

  it("scrubs dangerous inherited environment variables before execution", async () => {
    await withTempWorkspace();
    process.env.GIT_DIR = "C:/sneaky/repo";
    process.env.GIT_WORK_TREE = "C:/sneaky/tree";
    process.env.BASH_ENV = "C:/sneaky/env";

    const output = await runBash(
      'node -e "console.log(JSON.stringify({gitDir:process.env.GIT_DIR ?? null, gitWorkTree:process.env.GIT_WORK_TREE ?? null, bashEnv:process.env.BASH_ENV ?? null}))"',
    );

    expect(JSON.parse(output)).toEqual({
      gitDir: null,
      gitWorkTree: null,
      bashEnv: null,
    });
  });

  it("scrubs newly created bare repo candidates after execution", async () => {
    const root = await withTempWorkspace();

    const output = await runBash(
      'node -e "const fs=require(\'node:fs\'); fs.mkdirSync(\'evil/objects\', { recursive: true }); fs.mkdirSync(\'evil/refs\', { recursive: true }); fs.writeFileSync(\'evil/HEAD\', \'ref: refs/heads/main\\n\'); console.log(\'created\')"',
    );

    await expect(readFile(path.join(root, "evil", "HEAD"), "utf8")).rejects.toThrow();
    expect(output).toContain("created");
    expect(output).toContain("scrubbed");
  });
});
