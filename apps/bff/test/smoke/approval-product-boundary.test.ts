import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Human Approval 产品边界", () => {
  it("BFF 不包含独立 Approval 产品模块或全局接口", async () => {
    const sourceRoot = path.resolve(process.cwd(), "src");
    await expect(access(path.join(sourceRoot, "approvals"))).rejects.toThrow();
    const appModule = await readFile(path.join(sourceRoot, "app.module.ts"), "utf8");
    expect(appModule).not.toMatch(/ApprovalsModule|ApprovalControlOptions/);
  });

  it("共享 Runtime 契约不包含 ApprovalControlPort 产品控制面", async () => {
    const contractsRoot = path.resolve(process.cwd(), "../../packages/runtime-contracts/src");
    await expect(access(path.join(contractsRoot, "approval-control.ts"))).rejects.toThrow();
    const index = await readFile(path.join(contractsRoot, "index.ts"), "utf8");
    expect(index).not.toContain("approval-control");
  });
});
