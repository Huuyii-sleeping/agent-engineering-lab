import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { compactMessages } from "../../../src/tools/context-compact.js";

let tempDir = "";
let previousCwd = "";

afterEach(async () => {
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
  tempDir = await mkdtemp(path.join(tmpdir(), "context-compact-test-"));
  previousCwd = process.cwd();
  process.chdir(tempDir);
}

describe("tools/context-compact", () => {
  it("redacts transcript snapshots before writing them to disk", async () => {
    await withWorkspace();

    const result = await compactMessages(
      {
        messages: [
          { role: "user", content: "token=sk-12345678901234567890" },
          { role: "assistant", content: "ok" },
        ],
      },
      "manual",
      1,
    );

    const beforeRaw = await readFile(path.join(process.cwd(), result.transcriptBeforePath), "utf8");
    expect(beforeRaw).toContain("[REDACTED_SECRET]");
    expect(beforeRaw).not.toContain("sk-12345678901234567890");
  });

  it("writes retention metadata alongside transcript snapshots", async () => {
    await withWorkspace();

    await compactMessages(
      {
        messages: [
          { role: "user", content: "hello" },
          { role: "assistant", content: "ok" },
        ],
      },
      "manual",
      1,
    );

    const files = await readdir(path.join(process.cwd(), ".transcripts"));
    expect(files.some((file) => file.endsWith(".meta.json"))).toBe(true);
  });

  it("skips transcript snapshot persistence when no-persistence mode is enabled", async () => {
    const previous = process.env.AGENT_PRIVACY_PERSISTENCE_MODE;
    process.env.AGENT_PRIVACY_PERSISTENCE_MODE = "disabled";
    try {
      await withWorkspace();

      const result = await compactMessages(
        {
          messages: [
            { role: "user", content: "hello" },
            { role: "assistant", content: "ok" },
          ],
        },
        "manual",
        1,
      );

      expect(result.transcriptBeforePath).toContain("disabled");
      await expect(readdir(path.join(process.cwd(), ".transcripts"))).rejects.toBeTruthy();
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_PRIVACY_PERSISTENCE_MODE;
      } else {
        process.env.AGENT_PRIVACY_PERSISTENCE_MODE = previous;
      }
    }
  });
});
