import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { buildDeliveryPlan, fileExistsInJsonScript } from "../../src/delivery/plan.js";

const tempDirs: string[] = [];

async function createWorkspace(name: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `${name}-`));
  tempDirs.push(dir);
  await mkdir(path.join(dir, "apps", "agent-cli"), { recursive: true });
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

describe("delivery plan", () => {
  it("detects existing package scripts from JSON content", () => {
    expect(fileExistsInJsonScript(JSON.stringify({ scripts: { lint: "eslint ." } }), "lint")).toBe(true);
    expect(fileExistsInJsonScript(JSON.stringify({ scripts: { lint: "   " } }), "lint")).toBe(false);
    expect(fileExistsInJsonScript("{invalid", "lint")).toBe(false);
  });

  it("preserves stage order, commands, and agent-cli applicability", async () => {
    const workspace = await createWorkspace("delivery-plan");
    const previousCwd = process.cwd();
    try {
      process.chdir(workspace);
      await writeJson(path.join(workspace, "package.json"), {
        scripts: {
          lint: "eslint .",
          test: "vitest run",
          build: "tsc -p tsconfig.json",
        },
      });
      await writeJson(path.join(workspace, "apps", "agent-cli", "package.json"), {
        scripts: {
          "test:regression": "tsx test/smoke/prd13-regression.ts",
          "test:observability": "tsx test/smoke/prd09-observability-smoke.ts",
          "test:hooks": "tsx test/smoke/prd14-hooks-smoke.ts",
          "test:recovery": "tsx test/smoke/prd16-recovery-smoke.ts",
          "test:scheduler": "tsx test/smoke/prd17-scheduler-smoke.ts",
        },
      });

      const docsPlan = await buildDeliveryPlan({ changedPaths: ["README.md"] });
      const cliPlan = await buildDeliveryPlan({ changedPaths: ["apps/agent-cli/src/delivery/index.ts"] });

      expect(cliPlan.map((item) => item.stage)).toEqual([
        "lint",
        "test",
        "build",
        "regression",
        "observability",
        "hooks",
        "recovery",
        "scheduler",
      ]);
      expect(cliPlan.map((item) => item.command)).toEqual([
        ["pnpm", "lint"],
        ["pnpm", "test"],
        ["pnpm", "build"],
        ["pnpm", "--filter", "agent-cli", "test:regression"],
        ["pnpm", "--filter", "agent-cli", "test:observability"],
        ["pnpm", "--filter", "agent-cli", "test:hooks"],
        ["pnpm", "--filter", "agent-cli", "test:recovery"],
        ["pnpm", "--filter", "agent-cli", "test:scheduler"],
      ]);
      expect(docsPlan.slice(3).map((item) => item.condition?.({ changedPaths: ["README.md"] }))).toEqual([
        false,
        false,
        false,
        false,
        false,
      ]);
      expect(
        cliPlan.slice(3).map((item) => item.condition?.({ changedPaths: ["apps/agent-cli/src/delivery/index.ts"] })),
      ).toEqual([
        true,
        true,
        true,
        true,
        true,
      ]);
    } finally {
      process.chdir(previousCwd);
    }
  });
});
