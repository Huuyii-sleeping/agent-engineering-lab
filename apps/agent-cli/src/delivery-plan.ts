import { readFile } from "node:fs/promises";
import path from "node:path";
import * as process from "node:process";
import type { DeliveryContext, DeliveryStagePlan } from "./delivery-types.js";

export function fileExistsInJsonScript(pkgJson: string, script: string): boolean {
  try {
    const parsed = JSON.parse(pkgJson) as { scripts?: Record<string, string> };
    return typeof parsed.scripts?.[script] === "string" && parsed.scripts[script].trim().length > 0;
  } catch {
    return false;
  }
}

export async function readPackageScripts(relativePath: string): Promise<string> {
  const file = path.join(process.cwd(), relativePath);
  return readFile(file, "utf8").catch(() => "{}");
}

export async function buildDeliveryPlan(ctx: DeliveryContext): Promise<DeliveryStagePlan[]> {
  const rootPkg = await readPackageScripts("package.json");
  const cliPkg = await readPackageScripts("apps/agent-cli/package.json");

  const hasRootLint = fileExistsInJsonScript(rootPkg, "lint");
  const hasRootTest = fileExistsInJsonScript(rootPkg, "test");
  const hasRootBuild = fileExistsInJsonScript(rootPkg, "build");
  const hasCliRegression = fileExistsInJsonScript(cliPkg, "test:regression");
  const hasCliObservability = fileExistsInJsonScript(cliPkg, "test:observability");
  const hasCliHooks = fileExistsInJsonScript(cliPkg, "test:hooks");
  const hasCliRecovery = fileExistsInJsonScript(cliPkg, "test:recovery");
  const hasCliScheduler = fileExistsInJsonScript(cliPkg, "test:scheduler");

  const touchesAgentCli = ctx.changedPaths.some((item) => item.startsWith("apps/agent-cli/"));

  return [
    {
      stage: "lint",
      command: ["pnpm", "lint"],
      condition: () => hasRootLint,
      skippedReason: "root package has no lint script",
    },
    {
      stage: "test",
      command: ["pnpm", "test"],
      condition: () => hasRootTest,
      skippedReason: "root package has no test script",
    },
    {
      stage: "build",
      command: ["pnpm", "build"],
      condition: () => hasRootBuild,
      skippedReason: "root package has no build script",
    },
    {
      stage: "regression",
      command: ["pnpm", "--filter", "agent-cli", "test:regression"],
      condition: () => touchesAgentCli && hasCliRegression,
      skippedReason: "agent-cli regression is not applicable for current changes",
    },
    {
      stage: "observability",
      command: ["pnpm", "--filter", "agent-cli", "test:observability"],
      condition: () => touchesAgentCli && hasCliObservability,
      skippedReason: "agent-cli observability smoke is not applicable for current changes",
    },
    {
      stage: "hooks",
      command: ["pnpm", "--filter", "agent-cli", "test:hooks"],
      condition: () => touchesAgentCli && hasCliHooks,
      skippedReason: "agent-cli hooks smoke is not applicable for current changes",
    },
    {
      stage: "recovery",
      command: ["pnpm", "--filter", "agent-cli", "test:recovery"],
      condition: () => touchesAgentCli && hasCliRecovery,
      skippedReason: "agent-cli recovery smoke is not applicable for current changes",
    },
    {
      stage: "scheduler",
      command: ["pnpm", "--filter", "agent-cli", "test:scheduler"],
      condition: () => touchesAgentCli && hasCliScheduler,
      skippedReason: "agent-cli scheduler smoke is not applicable for current changes",
    },
  ];
}
