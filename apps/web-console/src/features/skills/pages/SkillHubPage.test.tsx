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
            validationErrors: [],
          },
        ]}
        remoteRegistry={{
          url: "https://registry.example.com/index.json",
          lastSyncedAt: 1782147600000,
          lastSyncError: "",
          skillCount: 7,
        }}
        onSkillAction={vi.fn()}
        onSyncRemoteRegistry={vi.fn()}
        onUpdateRemoteRegistryUrl={vi.fn()}
        onUploadPackage={vi.fn()}
      />,
    );

    expect(html).toContain("Skill registry");
    expect(html).toContain("Skill Hub 状态");
    expect(html).toContain("Registry filters");
    expect(html).toContain("搜索 skill、来源或标签");
    expect(html).toContain("Local workspace");
    expect(html).toContain("Release Registry");
    expect(html).toContain("Official");
    expect(html).toContain("2400");
    expect(html).toContain("4.6");
    expect(html).toContain("Hash verified");
    expect(html).toContain("文件读写 / 命令执行");
    expect(html).toContain("只看已安装");
    expect(html).toContain("Remote registry");
    expect(html).toContain("https://registry.example.com/index.json");
    expect(html).toContain("同步索引");
    expect(html).toContain("已安装");
    expect(html).toContain("下载");
    expect(html).toContain("Custom upload");
  });
});
