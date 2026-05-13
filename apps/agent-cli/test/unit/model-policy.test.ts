import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as process from "node:process";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

async function withWorkspace<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), `${name}-`));
  tempDirs.push(dir);
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

afterEach(async () => {
  delete process.env.MODEL_CODING;
  delete process.env.MODEL_CODING_FALLBACK;
  delete process.env.MODEL_FALLBACK;
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
});

describe("model policy", () => {
  it("routes by role and uses role-specific model env", async () => {
    process.env.MODEL_CODING = "gpt-5";
    await withWorkspace("model-policy-route", async () => {
      const { ModelPolicyManager } = await import("../../src/model-policy.js");
      const manager = new ModelPolicyManager();
      const selection = await manager.selectModel("coding", "gpt-4o-mini", 1000);
      expect(selection.model).toBe("gpt-5");
      expect(selection.budgetAction).toBe("allow");
    });
  });

  it("downgrades to fallback when session budget is exceeded", async () => {
    process.env.MODEL_CODING = "gpt-5";
    process.env.MODEL_CODING_FALLBACK = "gpt-4o-mini";
    await withWorkspace("model-policy-fallback", async () => {
      const runtimeModule = await import("../../src/runtime-config.js");
      runtimeModule.RUNTIME_CONFIG.modelSessionTokenBudget = 1000;
      const { ModelPolicyManager } = await import("../../src/model-policy.js");
      const manager = new ModelPolicyManager();
      await manager.finalizeUsage({
        role: "coding",
        model: "gpt-5",
        promptTokens: 900,
        completionTokens: 0,
        latencyMs: 1,
        fallbackUsed: false,
      });
      const selection = await manager.selectModel("coding", "gpt-5", 200);
      expect(selection.budgetAction).toBe("downgrade");
      expect(selection.model).toBe("gpt-4o-mini");
    });
  });

  it("denies when no fallback is available and budget is exceeded", async () => {
    process.env.MODEL_CODING = "gpt-5";
    await withWorkspace("model-policy-deny", async () => {
      const runtimeModule = await import("../../src/runtime-config.js");
      runtimeModule.RUNTIME_CONFIG.modelSessionTokenBudget = 1000;
      const { ModelPolicyManager } = await import("../../src/model-policy.js");
      const manager = new ModelPolicyManager();
      await manager.finalizeUsage({
        role: "coding",
        model: "gpt-5",
        promptTokens: 950,
        completionTokens: 0,
        latencyMs: 1,
        fallbackUsed: false,
      });
      const selection = await manager.selectModel("coding", "gpt-5", 200);
      expect(selection.budgetAction).toBe("deny");
      expect(selection.budgetReason).toBe("session_budget_exceeded");
    });
  });

  it("reads persisted usage snapshots for CLI status surfaces", async () => {
    await withWorkspace("model-policy-usage", async () => {
      const { ModelPolicyManager, readModelUsageSnapshot } = await import("../../src/model-policy.js");
      const manager = new ModelPolicyManager();
      await manager.finalizeUsage({
        role: "coding",
        model: "gpt-4o-mini",
        promptTokens: 300,
        completionTokens: 120,
        latencyMs: 1,
        fallbackUsed: false,
      });

      expect(await readModelUsageSnapshot("gpt-4o-mini")).toMatchObject({
        model: "gpt-4o-mini",
        sessionPromptTokens: 300,
        sessionCompletionTokens: 120,
      });
    });
  });
});
