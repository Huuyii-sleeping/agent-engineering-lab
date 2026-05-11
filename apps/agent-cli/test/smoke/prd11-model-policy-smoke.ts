import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const workspace = await mkdtemp(path.join(tmpdir(), "prd11-model-policy-"));
  const previous = process.cwd();
  try {
    process.chdir(workspace);
    process.env.MODEL_CODING = "gpt-5";
    process.env.MODEL_CODING_FALLBACK = "gpt-4o-mini";
    const runtimeModule = await import("../../src/runtime-config.js");
    runtimeModule.RUNTIME_CONFIG.modelSessionTokenBudget = 1000;
    const { ModelPolicyManager } = await import("../../src/model-policy.js");
    const manager = new ModelPolicyManager();

    const first = await manager.selectModel("coding", "gpt-5", 400);
    assert(first.model === "gpt-5", "first selection should use primary model");
    await manager.finalizeUsage({
      role: "coding",
      model: first.model,
      promptTokens: 900,
      completionTokens: 0,
      latencyMs: 5,
      fallbackUsed: false,
    });

    const second = await manager.selectModel("coding", "gpt-5", 200);
    assert(second.budgetAction === "downgrade", "second selection should downgrade after budget pressure");
    assert(second.model === "gpt-4o-mini", "fallback model should be selected");

    console.log("PRD11_MODEL_POLICY_SMOKE_OK");
  } finally {
    process.chdir(previous);
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error("PRD11_MODEL_POLICY_SMOKE_FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
