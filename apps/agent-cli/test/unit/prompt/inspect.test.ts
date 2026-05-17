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

  it("discloses categories suppressed by the active privacy posture", () => {
    const previousMemory = process.env.AGENT_PRIVACY_MEMORY_MODE;
    const previousExternal = process.env.AGENT_PRIVACY_EXTERNAL_CAPABILITIES_MODE;
    process.env.AGENT_PRIVACY_MEMORY_MODE = "disabled";
    process.env.AGENT_PRIVACY_EXTERNAL_CAPABILITIES_MODE = "disabled";
    try {
      const dump = inspectPromptSource({
        core: "Core rules",
        tools: ["tool manifest"],
        skills: [],
        rules: [],
        memoryContext: "memory context",
        dynamicMessages: ["runtime details"],
      });

      expect(dump.suppressedCategories).toContainEqual(
        expect.objectContaining({ id: "memory_context" }),
      );
      expect(dump.suppressedCategories).toContainEqual(
        expect.objectContaining({ id: "external_capabilities" }),
      );
    } finally {
      if (previousMemory === undefined) {
        delete process.env.AGENT_PRIVACY_MEMORY_MODE;
      } else {
        process.env.AGENT_PRIVACY_MEMORY_MODE = previousMemory;
      }
      if (previousExternal === undefined) {
        delete process.env.AGENT_PRIVACY_EXTERNAL_CAPABILITIES_MODE;
      } else {
        process.env.AGENT_PRIVACY_EXTERNAL_CAPABILITIES_MODE = previousExternal;
      }
    }
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

  it("suppresses protected prompt dump persistence when no-persistence mode is enabled", async () => {
    const previous = process.env.AGENT_PRIVACY_PERSISTENCE_MODE;
    process.env.AGENT_PRIVACY_PERSISTENCE_MODE = "disabled";
    try {
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

      expect(dump.protectedExportPath).toBeNull();
      expect(dump.persistenceBlockedReason).toContain("disabled");
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_PRIVACY_PERSISTENCE_MODE;
      } else {
        process.env.AGENT_PRIVACY_PERSISTENCE_MODE = previous;
      }
    }
  });
});
