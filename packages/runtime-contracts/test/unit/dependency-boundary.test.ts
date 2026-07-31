import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const BANNED_IMPORTS = [
  "@mastra/",
  "@nestjs/",
  "node:http",
  "node:https",
  "express",
  "better-sqlite3",
  "@libsql/",
];

const SHARED_DECLARATIONS = [
  "RuntimeGateway",
  "AgentRuntimePort",
  "WorkflowRuntimePort",
  "ToolExecutionPort",
  "MemoryRuntimePort",
  "AgentRuntimeEvent",
];

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(target);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [target] : [];
  }));
  return nested.flat();
}

describe("runtime-contracts dependency boundary", () => {
  it("不包含 Mastra、Nest、Node HTTP 或具体 storage import", async () => {
    const root = path.resolve(process.cwd(), "src");
    const violations: string[] = [];

    for (const file of await sourceFiles(root)) {
      const content = await readFile(file, "utf8");
      for (const banned of BANNED_IMPORTS) {
        if (content.includes(`from \"${banned}`) || content.includes(`from '${banned}`)) {
          violations.push(`${path.relative(root, file)} -> ${banned}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("Web、BFF、Agent 与其他共享包不重复声明 Runtime Port", async () => {
    const workspaceRoot = path.resolve(process.cwd(), "../..");
    const roots: string[] = [];
    for (const group of ["apps", "packages"]) {
      const entries = await readdir(path.join(workspaceRoot, group), { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || (group === "packages" && entry.name === "runtime-contracts")) {
          continue;
        }
        roots.push(path.join(workspaceRoot, group, entry.name, "src"));
      }
    }

    const duplicates: string[] = [];
    for (const root of roots) {
      for (const file of await sourceFiles(root).catch(() => [])) {
        const content = await readFile(file, "utf8");
        for (const declaration of SHARED_DECLARATIONS) {
          if (new RegExp(
            `^(?:export\\s+)?(?:declare\\s+)?(?:interface|type|class)\\s+${declaration}\\b`,
            "m",
          ).test(content)) {
            duplicates.push(`${path.relative(workspaceRoot, file)} -> ${declaration}`);
          }
        }
      }
    }

    expect(duplicates).toEqual([]);
  });
});
