import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { runWriteFile } from "../../../src/tools/file-tools.js";

const tempDirs: string[] = [];

async function withWorkspace<T>(name: string, fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), `${name}-`));
  tempDirs.push(root);
  const previous = process.cwd();
  process.chdir(root);
  try {
    return await fn(root);
  } finally {
    process.chdir(previous);
  }
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
});

describe("tools/file-tools secret scanning", () => {
  it("blocks and rolls back high-confidence secret writes", async () => {
    await withWorkspace("file-secret-block", async (root) => {
      const result = await runWriteFile("tmp/leak.txt", "OPENAI_API_KEY=sk-123456789012345678901234");

      expect(result).toContain("SECURITY_SECRET_DETECTED");
      await expect(access(path.join(root, "tmp", "leak.txt"))).rejects.toBeTruthy();
      const rawAudit = await readFile(path.join(root, ".audit", "security_events.jsonl"), "utf8");
      expect(rawAudit).toContain("secret_scan_finding");
    });
  });

  it("persists warn findings for retained workspace writes", async () => {
    await withWorkspace("file-secret-warn", async (root) => {
      const result = await runWriteFile("tmp/warn.ts", 'const API_KEY = "placeholder-dev-token-123456";\n');

      expect(result).toContain("security warning");
      const findingsRaw = await readFile(path.join(root, ".security", "secret-findings.json"), "utf8");
      expect(findingsRaw).toContain("\"action\": \"warn\"");
      expect(findingsRaw).toContain("\"targetPath\": \"tmp/warn.ts\"");
    });
  });
});
