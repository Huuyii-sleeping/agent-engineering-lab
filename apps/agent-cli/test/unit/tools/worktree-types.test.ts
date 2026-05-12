import { describe, expect, it } from "vitest";
import { dirtyWorktreeFailure, previewCommand, validWorktreeName } from "../../../src/tools/worktree-types.js";

describe("tools/worktree-types", () => {
  it("keeps worktree name validation and command preview behavior stable", () => {
    expect(validWorktreeName("feature.prd-30")).toBe(true);
    expect(validWorktreeName("../escape")).toBe(false);
    expect(validWorktreeName("x".repeat(41))).toBe(false);

    expect(previewCommand("  echo    hello  ")).toBe("echo hello");
    expect(previewCommand("x".repeat(165), 10)).toBe("xxxxxxxxxx...");
  });

  it("keeps dirty worktree failure output shape stable", () => {
    const output = JSON.parse(dirtyWorktreeFailure("lane-a", ["M file.txt"])) as {
      ok?: boolean;
      error?: { code?: string; message?: string };
      dirtyFiles?: string[];
    };

    expect(output.ok).toBe(false);
    expect(output.error?.code).toBe("DIRTY_WORKTREE");
    expect(output.error?.message).toContain("lane-a");
    expect(output.dirtyFiles).toEqual(["M file.txt"]);
  });
});
