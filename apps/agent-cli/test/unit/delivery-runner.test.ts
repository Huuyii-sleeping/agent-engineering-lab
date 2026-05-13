import { describe, expect, it } from "vitest";
import { classifyDeliveryFailure, isRetryableDeliveryFailure } from "../../src/delivery-runner.js";
import type { DeliveryFailure } from "../../src/delivery-types.js";

describe("delivery runner", () => {
  it("preserves deterministic stage failure classification", () => {
    expect(classifyDeliveryFailure("lint", new Error("lint failed"), "")).toMatchObject({
      code: "LINT_FAILED",
      suggestion: "Fix the reported lint or type issues, then rerun validation.",
    });
    expect(classifyDeliveryFailure("build", new Error("build failed"), "")).toMatchObject({
      code: "BUILD_FAILED",
      suggestion: "Check recent type, import, or bundling changes in the touched packages before retrying the build.",
    });
    expect(classifyDeliveryFailure("test", new Error("test failed"), "")).toMatchObject({
      code: "TEST_FAILED",
      suggestion: "Inspect the failing test or smoke output and update the implementation or expectation before retrying.",
    });
  });

  it("preserves command, timeout, and transient classification", () => {
    expect(classifyDeliveryFailure("test", Object.assign(new Error("spawn pnpm ENOENT"), { code: "ENOENT" }), "")).toMatchObject({
      code: "COMMAND_NOT_FOUND",
      suggestion: "Confirm pnpm and the referenced script exist in this workspace before retrying.",
    });
    expect(classifyDeliveryFailure("test", Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }), "")).toMatchObject({
      code: "TIMEOUT",
      suggestion: "Retry the same stage once the environment is stable, or reduce the scope of the validation command.",
    });
    expect(classifyDeliveryFailure("test", Object.assign(new Error("socket reset"), { code: "ECONNRESET" }), "")).toMatchObject({
      code: "TRANSIENT_EXEC_FAILURE",
      suggestion: "The failure looks transient. Retry the stage after the local environment or network recovers.",
    });
  });

  it("only retries timeout and transient execution failures", () => {
    const failure = (code: DeliveryFailure["code"]): DeliveryFailure => ({
      stage: "test",
      code,
      message: code,
      suggestion: code,
    });

    expect(isRetryableDeliveryFailure(failure("TIMEOUT"))).toBe(true);
    expect(isRetryableDeliveryFailure(failure("TRANSIENT_EXEC_FAILURE"))).toBe(true);
    expect(isRetryableDeliveryFailure(failure("TEST_FAILED"))).toBe(false);
    expect(isRetryableDeliveryFailure(failure("BUILD_FAILED"))).toBe(false);
  });
});
