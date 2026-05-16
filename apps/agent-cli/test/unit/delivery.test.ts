import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { loadLatestDeliveryReport, runDeliveryValidation } from "../../src/delivery/index.js";

const tempDirs: string[] = [];

async function createWorkspace(name: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `${name}-`));
  tempDirs.push(dir);
  return dir;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
});

describe("delivery validation", () => {
  it("runs staged validation and persists a passing report", async () => {
    const workspace = await createWorkspace("delivery-pass");
    const previousCwd = process.cwd();
    try {
      process.chdir(workspace);
      await mkdir(path.join(workspace, "apps", "agent-cli"), { recursive: true });
      await writeJson(path.join(workspace, "package.json"), {
        name: "delivery-pass",
        private: true,
        scripts: {
          lint: "node -e \"console.log('lint ok')\"",
          test: "node -e \"console.log('test ok')\"",
          build: "node -e \"console.log('build ok')\"",
        },
      });
      await writeFile(path.join(workspace, "pnpm-workspace.yaml"), "packages:\n  - \"apps/*\"\n", "utf8");
      await writeJson(path.join(workspace, "apps", "agent-cli", "package.json"), {
        name: "agent-cli",
        private: true,
        scripts: {},
      });

      const report = await runDeliveryValidation({
        mode: "manual",
        changedPaths: ["README.md"],
      });

      expect(report.summary.status).toBe("passed");
      expect(report.summary.passedStages).toBe(4);
      expect(report.stages[0]).toMatchObject({
        stage: "security",
        status: "passed",
      });
      const persisted = await loadLatestDeliveryReport();
      expect(persisted?.summary.status).toBe("passed");
      const raw = await readFile(path.join(workspace, ".delivery", "delivery_report.json"), "utf8");
      expect(raw).toContain("\"status\": \"passed\"");
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("classifies failing stages and stops at the first deterministic failure", async () => {
    const workspace = await createWorkspace("delivery-fail");
    const previousCwd = process.cwd();
    try {
      process.chdir(workspace);
      await mkdir(path.join(workspace, "apps", "agent-cli"), { recursive: true });
      await writeJson(path.join(workspace, "package.json"), {
        name: "delivery-fail",
        private: true,
        scripts: {
          lint: "node -e \"process.exit(1)\"",
          test: "node -e \"console.log('should not run')\"",
          build: "node -e \"console.log('should not run')\"",
        },
      });
      await writeFile(path.join(workspace, "pnpm-workspace.yaml"), "packages:\n  - \"apps/*\"\n", "utf8");
      await writeJson(path.join(workspace, "apps", "agent-cli", "package.json"), {
        name: "agent-cli",
        private: true,
        scripts: {},
      });

      const report = await runDeliveryValidation({
        mode: "manual",
        changedPaths: ["apps/agent-cli/src/main.ts"],
      });

      expect(report.summary.status).toBe("failed");
      expect(report.latestFailure?.stage).toBe("lint");
      expect(report.latestFailure?.code).toBe("LINT_FAILED");
      expect(report.stages[0]).toMatchObject({
        stage: "security",
        status: "passed",
      });
      expect(report.stages[1]).toMatchObject({
        stage: "lint",
        status: "failed",
      });
      expect(report.stages.slice(2).every((stage) => stage.status !== "passed")).toBe(true);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("fails delivery validation when changed files still contain unresolved secret findings", async () => {
    const workspace = await createWorkspace("delivery-secret");
    const previousCwd = process.cwd();
    try {
      process.chdir(workspace);
      await mkdir(path.join(workspace, "apps", "agent-cli", "src"), { recursive: true });
      await writeJson(path.join(workspace, "package.json"), {
        name: "delivery-secret",
        private: true,
        scripts: {
          lint: "node -e \"console.log('lint ok')\"",
        },
      });
      await writeFile(path.join(workspace, "pnpm-workspace.yaml"), "packages:\n  - \"apps/*\"\n", "utf8");
      await writeJson(path.join(workspace, "apps", "agent-cli", "package.json"), {
        name: "agent-cli",
        private: true,
        scripts: {},
      });
      await writeFile(
        path.join(workspace, "apps", "agent-cli", "src", "leak.ts"),
        "export const token = 'sk-123456789012345678901234';\n",
        "utf8",
      );

      const report = await runDeliveryValidation({
        mode: "manual",
        changedPaths: ["apps/agent-cli/src/leak.ts"],
      });

      expect(report.summary.status).toBe("failed");
      expect(report.latestFailure).toMatchObject({
        stage: "security",
        code: "SECRET_FINDINGS_BLOCKED",
      });
      expect(report.risks).toEqual(
        expect.arrayContaining([expect.stringContaining("secret findings")]),
      );
    } finally {
      process.chdir(previousCwd);
    }
  });
});
