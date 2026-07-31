import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const workspace = await mkdtemp(path.join(tmpdir(), "prd10-delivery-"));
  const previousCwd = process.cwd();

  try {
    process.chdir(workspace);
    await mkdir(path.join(workspace, "apps", "agent-cli"), { recursive: true });
    await writeFile(path.join(workspace, "pnpm-workspace.yaml"), "packages:\n  - \"apps/*\"\n", "utf8");
    await writeJson(path.join(workspace, "package.json"), {
      name: "prd10-delivery-smoke",
      private: true,
      scripts: {
        lint: "node -e \"console.log('lint ok')\"",
        test: "node -e \"console.log('test ok')\"",
        build: "node -e \"console.log('build ok')\"",
      },
    });
    await writeJson(path.join(workspace, "apps", "agent-cli", "package.json"), {
      name: "agent-cli",
      private: true,
      scripts: {
        "test:regression": "node -e \"console.log('regression ok')\"",
        "test:observability": "node -e \"console.log('observability ok')\"",
        "test:hooks": "node -e \"console.log('hooks ok')\"",
        "test:recovery": "node -e \"console.log('recovery ok')\"",
        "test:scheduler": "node -e \"console.log('scheduler ok')\"",
      },
    });

    const { runDeliveryValidation } = await import("../../src/delivery/index.js");
    const report = await runDeliveryValidation({
      mode: "auto",
      changedPaths: ["apps/agent-cli/src/runtime/mastra-default-service.ts"],
    });

    assert(report.summary.status === "passed", "delivery validation should pass");
    assert(report.summary.passedStages >= 3, "delivery validation should pass standard stages");
    assert(report.stages.some((item) => item.stage === "regression" && item.status === "passed"), "agent-cli smoke should run");

    const raw = await readFile(path.join(workspace, ".delivery", "delivery_report.json"), "utf8");
    assert(raw.includes("\"mode\": \"auto\""), "delivery report should persist mode");
    assert(raw.includes("\"status\": \"passed\""), "delivery report should persist pass status");

    console.log("PRD10_DELIVERY_SMOKE_OK");
  } finally {
    process.chdir(previousCwd);
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error("PRD10_DELIVERY_SMOKE_FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
