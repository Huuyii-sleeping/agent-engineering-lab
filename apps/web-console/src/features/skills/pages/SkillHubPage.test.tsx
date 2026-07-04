import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SkillHubPage } from "./SkillHubPage";

describe("SkillHubPage", () => {
  it("renders a registry-style skill hub with metadata and load state", () => {
    const html = renderToStaticMarkup(
      <SkillHubPage
        skills={[
          {
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
          },
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
    expect(html).toContain("可回滚到 v1.1.0");
    expect(html).toContain("回滚");
    expect(html).toContain("下载");
    expect(html).toContain("Private publish");
    expect(html).toContain("查看上传标准格式");
    expect(html).toContain("&quot;path&quot;: &quot;SKILL.md&quot;");
    expect(html).toContain("&quot;path&quot;: &quot;skill.json&quot;");
  });
});
