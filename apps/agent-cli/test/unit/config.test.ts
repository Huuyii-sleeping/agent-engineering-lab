import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { getStaticPromptSource, resolveOpenAiBaseUrl } from "../../src/config.js";

let tempDir = "";
let previousCwd = "";
const previousAgentType = process.env.AGENT_MEMORY_AGENT_TYPE;
const previousAgentScope = process.env.AGENT_MEMORY_SCOPE;
const previousAgentMode = process.env.AGENT_MEMORY_MODE;

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

afterEach(async () => {
  restoreEnv("AGENT_MEMORY_AGENT_TYPE", previousAgentType);
  restoreEnv("AGENT_MEMORY_SCOPE", previousAgentScope);
  restoreEnv("AGENT_MEMORY_MODE", previousAgentMode);
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
  tempDir = await mkdtemp(path.join(tmpdir(), "config-agent-memory-test-"));
  previousCwd = process.cwd();
  process.chdir(tempDir);
}

describe("config", () => {
  it("does not bind legacy Agent Memory files into the static prompt source", async () => {
    await withWorkspace();
    process.env.AGENT_MEMORY_AGENT_TYPE = "Reviewer";
    process.env.AGENT_MEMORY_SCOPE = "project";
    process.env.AGENT_MEMORY_MODE = "read_only";
    const memoryDir = path.join(process.cwd(), ".agent", "agent-memory", "reviewer");
    await mkdir(memoryDir, { recursive: true });
    await writeFile(path.join(memoryDir, "MEMORY.md"), "# Memory Index\n\n- prefer strict reviews\n", "utf8");

    const source = getStaticPromptSource();

    expect("agentMemory" in source).toBe(false);
    expect(JSON.stringify(source)).not.toContain("prefer strict reviews");
  });

  it("resolves the OpenAI-compatible base URL with legacy alias support", () => {
    expect(resolveOpenAiBaseUrl({ OPENAI_BASEURL: " https://proxy.example/v1 " })).toBe(
      "https://proxy.example/v1",
    );
    expect(
      resolveOpenAiBaseUrl({
        OPENAI_BASE_URL: "https://standard.example/v1",
        OPENAI_BASEURL: "https://legacy.example/v1",
      }),
    ).toBe("https://standard.example/v1");
  });
});
