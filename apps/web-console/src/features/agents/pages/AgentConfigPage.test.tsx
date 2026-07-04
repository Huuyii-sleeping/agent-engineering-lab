import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultAgentProfileInput, type AgentProfile, type SkillRegistryItem } from "../../../api";
import { AgentConfigPage } from "./AgentConfigPage";

const savedAgent: AgentProfile = {
  id: "agent-1",
  ...defaultAgentProfileInput,
  avatarId: "bot",
  createdAt: 1,
  updatedAt: 2,
};

const installedSkills: SkillRegistryItem[] = [
  {
    id: "code-workspace",
    name: "代码工作区",
    description: "Use when editing code.",
    summary: "读取仓库、修改文件、运行验证命令。",
    category: "执行",
    provider: "Workspace",
    version: "1.2.0",
    runtime: "Local workspace",
    permissions: ["文件读写", "命令执行"],
    updatedAt: "2026-06-18",
    maturity: "stable",
    tags: ["code"],
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
    installedVersion: "1.1.0",
    installedAt: 1,
    availableVersion: "1.2.0",
    previousInstalledVersion: "",
    validationErrors: [],
  },
];

describe("AgentConfigPage", () => {
  it("shows discard copy for unsaved drafts and exposes operation errors", () => {
    const html = renderToStaticMarkup(
      <AgentConfigPage
        activeAgent={null}
        draft={{ ...defaultAgentProfileInput, name: "新 Agent 1" }}
        error="Failed to fetch"
        isNewDraft={true}
        saving={false}
        installedSkills={installedSkills}
        skillPreflight={null}
        skillPreflightLoading={false}
        onBack={vi.fn()}
        onDeleteAgent={vi.fn()}
        onDiscardDraft={vi.fn()}
        onDraftChange={vi.fn()}
        onResolveAgentSkills={vi.fn()}
        onSaveAgent={vi.fn()}
        onTestAgent={vi.fn()}
      />,
    );

    expect(html).toContain("丢弃并返回");
    expect(html).toContain("丢弃草稿");
    expect(html).toContain("Agent 草稿操作失败");
    expect(html).toContain("Failed to fetch");
    expect(html).toContain("锁定 v1.1.0");
    expect(html).toContain("版本缺失");
    expect(html).toContain("未检查");
    expect(html).toContain("保存或测试前可先检查");
  });

  it("keeps delete copy for persisted agents", () => {
    const html = renderToStaticMarkup(
      <AgentConfigPage
        activeAgent={savedAgent}
        draft={defaultAgentProfileInput}
        error={null}
        isNewDraft={false}
        saving={false}
        installedSkills={installedSkills}
        skillPreflight={{
          ok: false,
          code: "AGENT_SKILL_LOAD_FAILED",
          message: "agent skill binding could not be loaded",
          agent: null,
          issues: [
            {
              skillId: "missing-skill",
              version: "1.0.0",
              sourceType: "remote",
              code: "SKILL_PACKAGE_NOT_FOUND",
              message: "skill package not found",
            },
          ],
        }}
        skillPreflightLoading={false}
        onBack={vi.fn()}
        onDeleteAgent={vi.fn()}
        onDiscardDraft={vi.fn()}
        onDraftChange={vi.fn()}
        onResolveAgentSkills={vi.fn()}
        onSaveAgent={vi.fn()}
        onTestAgent={vi.fn()}
      />,
    );

    expect(html).toContain("返回草稿库");
    expect(html).toContain("Agent 头像");
    expect(html).toContain("bot");
    expect(html).toContain("上传");
    expect(html).toContain("disabled=\"\"");
    expect(html).toContain("删除");
    expect(html).not.toContain("丢弃草稿");
    expect(html).toContain("已卸载");
    expect(html).toContain("运行时加载失败");
    expect(html).toContain("skill package not found");
  });

  it("shows healthy and drifted version-locked skill bindings", () => {
    const html = renderToStaticMarkup(
      <AgentConfigPage
        activeAgent={savedAgent}
        draft={{
          ...defaultAgentProfileInput,
          skillIds: ["code-workspace"],
          skills: [
            { skillId: "code-workspace", version: "1.0.0", sourceType: "builtin", registrySource: "local" },
            { skillId: "stale-skill", version: "0.1.0", sourceType: "builtin", registrySource: "local" },
          ],
        }}
        error={null}
        isNewDraft={false}
        saving={false}
        installedSkills={installedSkills}
        skillPreflight={null}
        skillPreflightLoading={false}
        onBack={vi.fn()}
        onDeleteAgent={vi.fn()}
        onDiscardDraft={vi.fn()}
        onDraftChange={vi.fn()}
        onResolveAgentSkills={vi.fn()}
        onSaveAgent={vi.fn()}
        onTestAgent={vi.fn()}
      />,
    );

    expect(html).toContain("版本漂移：当前已安装 v1.1.0");
    expect(html).toContain("stale-skill");
    expect(html).toContain("已卸载");

    const healthyHtml = renderToStaticMarkup(
      <AgentConfigPage
        activeAgent={savedAgent}
        draft={{
          ...defaultAgentProfileInput,
          skillIds: ["code-workspace"],
          skills: [{ skillId: "code-workspace", version: "1.1.0", sourceType: "builtin", registrySource: "local" }],
        }}
        error={null}
        isNewDraft={false}
        saving={false}
        installedSkills={installedSkills}
        skillPreflight={{
          ok: true,
          agent: null,
          skills: [{ name: "代码工作区", sourceType: "builtin", path: "/skills/code-workspace/SKILL.md", contentLength: 180 }],
        }}
        skillPreflightLoading={false}
        onBack={vi.fn()}
        onDeleteAgent={vi.fn()}
        onDiscardDraft={vi.fn()}
        onDraftChange={vi.fn()}
        onResolveAgentSkills={vi.fn()}
        onSaveAgent={vi.fn()}
        onTestAgent={vi.fn()}
      />,
    );

    expect(healthyHtml).toContain("绑定正常");
    expect(healthyHtml).toContain("运行时可加载");
    expect(healthyHtml).toContain("1 个 Skill 已通过运行时解析");
  });
});
