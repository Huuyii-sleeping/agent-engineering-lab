import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SkillRegistryItem } from "../../../api";
import { SkillHubPage, shouldConfirmSkillImpact, skillActionLabel } from "./SkillHubPage";

const installedSkill: SkillRegistryItem = {
  id: "code-workspace",
  name: "代码工作区",
  description: "Use when an agent needs to inspect a repository and edit code.",
  summary: "读取仓库、修改文件、运行验证命令。",
  category: "执行",
  provider: "Workspace",
  version: "1.2.0",
  runtime: "Local workspace",
  permissions: ["文件读写", "命令执行"],
  updatedAt: "2026-06-18",
  maturity: "stable",
  tags: ["code", "test", "repo"],
  entry: "SKILL.md",
  sourceType: "builtin",
  registrySource: "local",
  publisher: { id: "workspace", name: "Workspace", verified: true },
  downloads: 0,
  rating: null,
  packageSha256: "",
  deprecated: false,
  status: "installed",
  installed: true,
  installedVersion: "1.2.0",
  installedAt: 1782691200000,
  availableVersion: "1.2.0",
  previousInstalledVersion: "1.1.0",
  validationErrors: [],
};

describe("SkillHubPage", () => {
  it("renders a registry-style skill hub with metadata and load state", () => {
    const html = renderToStaticMarkup(
      <SkillHubPage
        agents={[
          {
            id: "agent-1",
            avatarId: "code",
            name: "研发 Agent",
            description: "处理代码任务",
            scenario: "代码开发",
            skillIds: ["code-workspace"],
            skills: [{ skillId: "code-workspace", version: "1.2.0", sourceType: "builtin", registrySource: "local" }],
            actions: [],
            systemPrompt: "",
            createdAt: 1782691200000,
            updatedAt: 1782691200000,
          },
          {
            id: "agent-2",
            avatarId: "assistant",
            name: "发布 Agent",
            description: "处理发布任务",
            scenario: "发布验证",
            skillIds: ["quality-gate"],
            skills: [],
            actions: [],
            systemPrompt: "",
            createdAt: 1782691200000,
            updatedAt: 1782691200000,
          },
        ]}
        auditEvents={[
          {
            id: "audit-1",
            action: "update",
            ok: true,
            code: "",
            message: "",
            skillId: "code-workspace",
            skillName: "代码工作区",
            version: "1.2.0",
            status: "installed",
            at: 1782691300000,
          },
          {
            id: "audit-2",
            action: "rollback",
            ok: false,
            code: "SKILL_ROLLBACK_NOT_AVAILABLE",
            message: "skill code-workspace has no local rollback target",
            skillId: "code-workspace",
            skillName: "代码工作区",
            version: "",
            status: "invalid",
            at: 1782691200000,
          },
        ]}
        registrySettings={{
          url: "https://registry.example.com/index.json",
          managedByService: false,
          lastSyncedAt: 1782691400000,
          lastSyncError: "",
          skillCount: 2,
        }}
        skills={[
          { ...installedSkill, status: "updateAvailable" },
          {
            id: "quality-gate",
            name: "质量闸门",
            description: "Use when an agent needs to verify changes with tests and builds.",
            summary: "执行测试、构建、回归与发布前检查。",
            category: "验证",
            provider: "Release",
            version: "0.9.0",
            runtime: "Validation runner",
            permissions: ["命令执行", "日志读取"],
            updatedAt: "2026-06-17",
            maturity: "stable",
            tags: ["build", "release"],
            entry: "SKILL.md",
            sourceType: "remote",
            registrySource: "official",
            publisher: { id: "release", name: "Release Registry", verified: true },
            downloads: 2400,
            rating: 4.6,
            packageSha256: "a".repeat(64),
            deprecated: false,
            status: "available",
            installed: false,
            installedVersion: "",
            installedAt: null,
            availableVersion: "0.9.0",
            previousInstalledVersion: "",
            validationErrors: [],
          },
        ]}
        onRollbackSkill={vi.fn()}
        onSkillAction={vi.fn()}
        onUploadPackage={vi.fn()}
      />,
    );

    expect(html).toContain("Production Skill Hub");
    expect(html).toContain("Hub readiness");
    expect(html).toContain("Registry synced");
    expect(html).toContain("<strong>1</strong>已安装");
    expect(html).toContain("<strong>1</strong>可升级");
    expect(html).toContain("<strong>1</strong>失败事件");
    expect(html).toContain("Skill filters");
    expect(html).toContain("搜索 skill、来源或标签");
    expect(html).toContain("Local workspace");
    expect(html).toContain("Release Registry");
    expect(html).toContain("Official");
    expect(html).toContain("2400");
    expect(html).toContain("4.6");
    expect(html).toContain("Hash verified");
    expect(html).toContain("文件读写 / 命令执行");
    expect(html).toContain("只看已安装");
    expect(html).not.toContain("Docker Registry");
    expect(html).not.toContain("http://127.0.0.1:3190/skills");
    expect(html).toContain("已安装");
    expect(html).toContain("详情");
    expect(html).toContain("Skill detail");
    expect(html).toContain("当前版本");
    expect(html).toContain("已安装版本");
    expect(html).toContain("上一版本");
    expect(html).toContain("可回滚到 v1.1.0");
    expect(html).toContain("回滚到 v1.1.0");
    expect(html).toContain("未发现校验错误");
    expect(html).toContain("使用中的 Agent");
    expect(html).toContain("1 个 Agent 正在绑定");
    expect(html).toContain("研发 Agent");
    expect(html).toContain("锁定 v1.2.0");
    expect(html).not.toContain("发布 Agent");
    expect(html).toContain("审计日志");
    expect(html).toContain("升级");
    expect(html).toContain("回滚失败");
    expect(html).toContain("skill code-workspace has no local rollback target");
    expect(html).toContain("回滚");
    expect(html).toContain("下载");
    expect(html).toContain("Private publish");
    expect(html).toContain("查看上传标准格式");
    expect(html).toContain("&quot;path&quot;: &quot;SKILL.md&quot;");
    expect(html).toContain("&quot;path&quot;: &quot;skill.json&quot;");
  });

  it("labels and confirms operations that can affect bound agents", () => {
    expect(skillActionLabel(installedSkill)).toBe("卸载");
    expect(skillActionLabel({ ...installedSkill, status: "updateAvailable" })).toBe("升级");
    expect(shouldConfirmSkillImpact({ ...installedSkill, status: "updateAvailable" }, 1, "primary")).toBe(true);
    expect(shouldConfirmSkillImpact(installedSkill, 1, "primary")).toBe(true);
    expect(shouldConfirmSkillImpact(installedSkill, 1, "rollback")).toBe(true);
    expect(shouldConfirmSkillImpact(installedSkill, 0, "rollback")).toBe(false);
    expect(shouldConfirmSkillImpact({ ...installedSkill, installed: false, status: "downloaded" }, 1, "primary")).toBe(false);
  });
});
