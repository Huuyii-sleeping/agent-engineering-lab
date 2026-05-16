import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportProtectedPromptDump, inspectPromptSource } from "../../../src/prompt/inspect.js";

let tempDir = "";

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    tempDir = "";
  }
});

describe("prompt/inspect", () => {
  it("hides supplemental dynamic message bodies in default inspection mode", () => {
    const dump = inspectPromptSource({
      core: "Core rules",
      tools: ["tool manifest"],
      skills: [],
      rules: [],
      memoryContext: "memory context",
      dynamicMessages: ["token=sk-12345678901234567890", "runtime secret"],
    });

    expect(dump.supplementalSystemMessages[0]).toContain("protected");
    expect(dump.supplementalSystemMessages.join("\n")).not.toContain("sk-12345678901234567890");
    expect(dump.inspectionMode).toBe("default");
  });

  it("returns full supplemental messages only in protected mode", () => {
    const dump = inspectPromptSource(
      {
        core: "Core rules",
        tools: ["tool manifest"],
        skills: [],
        rules: [],
        memoryContext: "memory context",
        dynamicMessages: ["runtime details"],
      },
      "protected",
    );

    expect(dump.supplementalSystemMessages).toContain("runtime details");
    expect(dump.inspectionMode).toBe("protected");
  });

  it("exports protected prompt dumps into the managed security directory with retention metadata", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "agent-prompt-dump-"));

    const dump = await exportProtectedPromptDump(
      {
        core: "Core rules",
        tools: ["tool manifest"],
        skills: [],
        rules: [],
        memoryContext: "memory context",
        dynamicMessages: ["runtime details"],
      },
      tempDir,
    );

    expect(dump.protectedExportPath).toContain(path.join(".security", "prompt-dumps"));
    const raw = await readFile(dump.protectedExportPath as string, "utf8");
    const parsed = JSON.parse(raw) as {
      kind: string;
      expiresAt: number;
      dump: { supplementalSystemMessages: string[] };
    };
    expect(parsed.kind).toBe("prompt_dump");
    expect(parsed.expiresAt).toBeGreaterThan(0);
    expect(parsed.dump.supplementalSystemMessages).toContain("runtime details");
  });
});
