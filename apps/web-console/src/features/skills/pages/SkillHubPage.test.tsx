import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SkillRegistryItem } from "../../../api";
import {
  SkillHubPage,
  filterSkillRegistry,
  isPrimarySkillActionDisabled,
  parseSkillSearchQuery,
  shouldConfirmSkillImpact,
  skillActionLabel,
  validateSkillPackageInput,
  type SkillLifecycleOperationState,
} from "./SkillHubPage";

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

function renderMinimalSkillHub({
  registryRefreshing = false,
  skillOperationInFlight = null,
  skills = [installedSkill],
}: {
  registryRefreshing?: boolean;
  skillOperationInFlight?: SkillLifecycleOperationState | null;
  skills?: SkillRegistryItem[];
} = {}): string {
  return renderToStaticMarkup(
    <SkillHubPage
      agents={[]}
      auditEvents={[]}
      readiness={null}
      registrySettings={null}
      registryRefreshing={registryRefreshing}
      skillOperationInFlight={skillOperationInFlight}
      skills={skills}
      onRefreshRegistry={vi.fn()}
      onRollbackSkill={vi.fn()}
      onSkillAction={vi.fn()}
      onUploadPackage={vi.fn()}
    />,
  );
}

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
        readiness={{
          status: "ready",
          registry: {
            url: "https://registry.example.com/index.json",
            managedByService: false,
            lastSyncedAt: 1782691400000,
            lastSyncError: "",
            skillCount: 2,
          },
          store: { readable: true, message: "" },
          counts: { total: 2, installed: 1, updateAvailable: 1, invalid: 0, failedAudit: 1 },
        }}
        registrySettings={{
          url: "https://registry.example.com/index.json",
          managedByService: false,
          lastSyncedAt: 1782691400000,
          lastSyncError: "",
          skillCount: 2,
        }}
        registryRefreshing={false}
        skillOperationInFlight={null}
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
    expect(html).not.toContain("Hub readiness");
    expect(html).not.toContain("Production ready");
    expect(html).not.toContain("刷新 registry");
    expect(html).not.toContain("Hub overview");
    expect(html).not.toContain("Status filters");
    expect(html).not.toContain("Source filters");
    expect(html).not.toContain("Maturity filters");
    expect(html).not.toContain("Recent operations");
    expect(html).toContain("代码工作区");
    expect(html).toContain("ES 搜索");
    expect(html).toContain("source:local");
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
    expect(html).toContain("aria-expanded=\"false\"");
    expect(html).toContain("aria-controls=\"skillhub-detail-code-workspace\"");
    expect(html).toContain("skillhub-detail-popover");
    expect(html).not.toContain("skillhub-detail-tooltip");
    expect(html).toContain("Skill detail");
    expect(html).not.toContain("skillhub-detail-panel");
    expect(html).toContain("当前版本");
    expect(html).toContain("已安装版本");
    expect(html).toContain("上一版本");
    expect(html).toContain("可回滚到 v1.1.0");
    expect(html).toContain("未发现校验错误");
    expect(html).toContain("使用中的 Agent");
    expect(html).toContain("1 个 Agent 正在绑定");
    expect(html).toContain("研发 Agent");
    expect(html).toContain("锁定 v1.2.0");
    expect(html).toContain("发布 Agent");
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

  it("parses ES-style search tokens", () => {
    expect(parseSkillSearchQuery("网页 tag:web source:local category:执行 status:installed maturity:stable")).toEqual({
      terms: ["网页"],
      tag: "web",
      source: "local",
      category: "执行",
      status: "installed",
      maturity: "stable",
    });
  });

  it("filters skills by status source maturity and loaded state", () => {
    const remoteBetaSkill: SkillRegistryItem = {
      ...installedSkill,
      id: "browser-automation",
      name: "浏览器自动化",
      category: "自动化",
      maturity: "beta",
      registrySource: "official",
      sourceType: "remote",
      status: "available",
      installed: false,
      installedVersion: "",
      installedAt: null,
    };
    const invalidPrivateSkill: SkillRegistryItem = {
      ...installedSkill,
      id: "private-invalid",
      name: "私有异常 Skill",
      registrySource: "private",
      sourceType: "custom",
      status: "invalid",
      installed: false,
      validationErrors: ["missing SKILL.md"],
    };
    const skills = [installedSkill, remoteBetaSkill, invalidPrivateSkill];

    expect(
      filterSkillRegistry(skills, {
        query: "",
        category: "全部",
        status: "available",
        source: "全部来源",
        maturity: "全部成熟度",
        loadedOnly: false,
      }).map((skill) => skill.id),
    ).toEqual(["browser-automation"]);
    expect(
      filterSkillRegistry(skills, {
        query: "",
        category: "全部",
        status: "全部状态",
        source: "official",
        maturity: "beta",
        loadedOnly: false,
      }).map((skill) => skill.id),
    ).toEqual(["browser-automation"]);
    expect(
      filterSkillRegistry(skills, {
        query: "",
        category: "全部",
        status: "全部状态",
        source: "全部来源",
        maturity: "全部成熟度",
        loadedOnly: true,
      }).map((skill) => skill.id),
    ).toEqual(["code-workspace"]);
    expect(
      filterSkillRegistry(skills, {
        query: "source:official tag:missing",
        category: "全部",
        status: "全部状态",
        source: "全部来源",
        maturity: "全部成熟度",
        loadedOnly: false,
      }).map((skill) => skill.id),
    ).toEqual([]);
    expect(
      filterSkillRegistry(skills, {
        query: "source:local tag:code",
        category: "全部",
        status: "全部状态",
        source: "全部来源",
        maturity: "全部成熟度",
        loadedOnly: false,
      }).map((skill) => skill.id),
    ).toEqual(["code-workspace"]);
  });

  it("labels and confirms operations that can affect bound agents", () => {
    expect(skillActionLabel(installedSkill)).toBe("卸载");
    expect(skillActionLabel({ ...installedSkill, status: "updateAvailable" })).toBe("升级");
    expect(skillActionLabel({ ...installedSkill, status: "invalid" })).toBe("不可用");
    expect(isPrimarySkillActionDisabled({ ...installedSkill, status: "invalid" })).toBe(true);
    expect(isPrimarySkillActionDisabled({ ...installedSkill, status: "available", deprecated: true })).toBe(true);
    expect(isPrimarySkillActionDisabled(installedSkill)).toBe(false);
    expect(shouldConfirmSkillImpact({ ...installedSkill, status: "updateAvailable" }, 1, "primary")).toBe(true);
    expect(shouldConfirmSkillImpact(installedSkill, 1, "primary")).toBe(true);
    expect(shouldConfirmSkillImpact(installedSkill, 1, "rollback")).toBe(true);
    expect(shouldConfirmSkillImpact(installedSkill, 0, "rollback")).toBe(false);
    expect(shouldConfirmSkillImpact({ ...installedSkill, installed: false, status: "downloaded" }, 1, "primary")).toBe(false);
  });

  it("renders pending lifecycle operation state", () => {
    const html = renderMinimalSkillHub({ skillOperationInFlight: { skillId: "code-workspace", kind: "primary" } });

    expect(html).toContain("aria-busy=\"true\"");
    expect(html).toContain("disabled=\"\"");
    expect(html).toContain("处理中");
  });

  it("does not render the removed registry refresh summary", () => {
    const html = renderMinimalSkillHub({ registryRefreshing: true });

    expect(html).not.toContain("同步中");
    expect(html).not.toContain("刷新 registry");
  });

  it("disables invalid skill primary actions", () => {
    const html = renderMinimalSkillHub({
      skills: [{ ...installedSkill, installed: false, status: "invalid", validationErrors: ["missing SKILL.md"] }],
    });

    expect(html).toContain("不可用");
    expect(html).toContain("missing SKILL.md");
    expect(html).toContain("disabled=\"\"");
  });

  it("validates custom skill package structure before upload", () => {
    expect(validateSkillPackageInput(null)).toBe("Skill package 必须是包含 files 的 JSON 对象。");
    expect(validateSkillPackageInput({ files: [] })).toBe("Skill package 必须包含非空 files 数组。");
    expect(validateSkillPackageInput({ files: [{ path: "", content: "x" }] })).toBe("每个文件都必须包含非空 path。");
    expect(validateSkillPackageInput({ files: [{ path: "SKILL.md", content: "" }] })).toBe("SKILL.md 必须包含非空 content。");
    expect(validateSkillPackageInput({ files: [{ path: "SKILL.md", content: "# Skill" }] })).toBe(
      "Skill package 必须包含 skill.json。",
    );
    expect(
      validateSkillPackageInput({
        files: [
          { path: "./SKILL.md", content: "# Skill" },
          { path: "skill.json", content: "{}" },
        ],
      }),
    ).toBeNull();
  });
});
