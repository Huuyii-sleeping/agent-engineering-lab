/** Skill displayed in the Agent Builder catalog. */
export type AgentSkill = {
  id: string;
  name: string;
  summary: string;
  category: string;
  provider: string;
  version: string;
  runtime: string;
  permissions: string[];
  updatedAt: string;
  maturity: "stable" | "beta";
  tags: string[];
};

/** SOP step displayed in the Agent Builder workflow catalog. */
export type AgentSopStep = {
  id: string;
  title: string;
  summary: string;
};

/** Local draft configuration for the user's assembled agent. */
export type AgentBuilderConfig = {
  name: string;
  scenario: string;
  selectedSkillIds: string[];
  selectedSopStepIds: string[];
};

type BuilderStorage = Pick<Storage, "getItem" | "setItem">;

const STORAGE_KEY = "agent-web-console-builder-config-v1";
const SKILL_HUB_STORAGE_KEY = "agent-web-console-skill-hub-v1";

export const agentSkillCatalog: AgentSkill[] = [
  {
    id: "browser-research",
    name: "网页研究",
    summary: "检索、阅读页面并提取可信信息。",
    category: "输入",
    provider: "Browser",
    version: "1.0.0",
    runtime: "Browser connector",
    permissions: ["网络访问", "页面读取"],
    updatedAt: "2026-06-14",
    maturity: "stable",
    tags: ["research", "web", "citation"],
  },
  {
    id: "code-workspace",
    name: "代码工作区",
    summary: "读取仓库、修改文件、运行验证命令。",
    category: "执行",
    provider: "Workspace",
    version: "1.2.0",
    runtime: "Local workspace",
    permissions: ["文件读写", "命令执行"],
    updatedAt: "2026-06-18",
    maturity: "stable",
    tags: ["code", "test", "repo"],
  },
  {
    id: "memory-context",
    name: "长期记忆",
    summary: "复用偏好、项目背景和历史结论。",
    category: "上下文",
    provider: "Local",
    version: "0.8.0",
    runtime: "Local memory",
    permissions: ["本地存储"],
    updatedAt: "2026-06-10",
    maturity: "beta",
    tags: ["context", "profile", "history"],
  },
  {
    id: "document-pipeline",
    name: "文档流水线",
    summary: "整理 PRD、方案、报告和交付说明。",
    category: "产出",
    provider: "Documents",
    version: "0.6.0",
    runtime: "Document runtime",
    permissions: ["文档生成", "文件读写"],
    updatedAt: "2026-06-12",
    maturity: "beta",
    tags: ["prd", "report", "handoff"],
  },
  {
    id: "quality-gate",
    name: "质量闸门",
    summary: "执行测试、构建、回归与发布前检查。",
    category: "验证",
    provider: "Release",
    version: "0.9.0",
    runtime: "Validation runner",
    permissions: ["命令执行", "日志读取"],
    updatedAt: "2026-06-17",
    maturity: "stable",
    tags: ["build", "regression", "release"],
  },
];

export const agentSopCatalog: AgentSopStep[] = [
  {
    id: "clarify-goal",
    title: "目标澄清",
    summary: "确定用户意图、边界和不可做事项。",
  },
  {
    id: "plan-work",
    title: "任务拆解",
    summary: "把目标拆成可执行步骤和验收口径。",
  },
  {
    id: "execute-tools",
    title: "工具执行",
    summary: "调用所选 skill 完成搜索、编辑或生成。",
  },
  {
    id: "verify-result",
    title: "验证收口",
    summary: "运行测试或检查结果，暴露剩余风险。",
  },
  {
    id: "deliver-summary",
    title: "交付总结",
    summary: "说明改动、验证方式和下一步建议。",
  },
];

export const defaultAgentBuilderConfig: AgentBuilderConfig = {
  name: "我的工作流 Agent",
  scenario: "面向本地研发、资料整理和自动化执行的 all-in-one agent。",
  selectedSkillIds: ["code-workspace", "memory-context", "quality-gate"],
  selectedSopStepIds: ["clarify-goal", "plan-work", "execute-tools", "verify-result", "deliver-summary"],
};

export const defaultDownloadedSkillIds = ["code-workspace", "memory-context"];

function cleanText(value: unknown, fallback: string, limit: number): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return (trimmed || fallback).slice(0, limit);
}

function knownIds<T extends { id: string }>(catalog: T[]): Set<string> {
  return new Set(catalog.map((item) => item.id));
}

function normalizeIds(value: unknown, known: Set<string>, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const ids = value.filter((item): item is string => typeof item === "string" && known.has(item));
  return [...new Set(ids)];
}

/** Normalizes a local builder config before it is used by the UI. */
export function normalizeAgentBuilderConfig(value: unknown): AgentBuilderConfig {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    name: cleanText(record.name, defaultAgentBuilderConfig.name, 36),
    scenario: cleanText(record.scenario, defaultAgentBuilderConfig.scenario, 120),
    selectedSkillIds: normalizeIds(
      record.selectedSkillIds,
      knownIds(agentSkillCatalog),
      defaultAgentBuilderConfig.selectedSkillIds,
    ),
    selectedSopStepIds: normalizeIds(
      record.selectedSopStepIds,
      knownIds(agentSopCatalog),
      defaultAgentBuilderConfig.selectedSopStepIds,
    ),
  };
}

/** Reads the local Agent Builder config from browser storage. */
export function readAgentBuilderConfig(storage: BuilderStorage | null | undefined): AgentBuilderConfig {
  if (!storage) {
    return defaultAgentBuilderConfig;
  }
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultAgentBuilderConfig;
  }
  try {
    return normalizeAgentBuilderConfig(JSON.parse(raw) as unknown);
  } catch {
    return defaultAgentBuilderConfig;
  }
}

/** Persists the local Agent Builder config to browser storage. */
export function writeAgentBuilderConfig(
  storage: BuilderStorage | null | undefined,
  config: AgentBuilderConfig,
): void {
  storage?.setItem(STORAGE_KEY, JSON.stringify(normalizeAgentBuilderConfig(config)));
}

/** Toggles one id in a stable ordered id list. */
export function toggleAgentBuilderId(selectedIds: string[], id: string, orderedIds: string[]): string[] {
  const selected = new Set(selectedIds);
  if (selected.has(id)) {
    selected.delete(id);
  } else if (orderedIds.includes(id)) {
    selected.add(id);
  }
  return orderedIds.filter((item) => selected.has(item));
}

/** Reads locally downloaded skill ids for the Skill Hub page. */
export function readDownloadedSkillIds(storage: BuilderStorage | null | undefined): string[] {
  if (!storage) {
    return defaultDownloadedSkillIds;
  }
  const raw = storage.getItem(SKILL_HUB_STORAGE_KEY);
  if (!raw) {
    return defaultDownloadedSkillIds;
  }
  try {
    return normalizeIds(JSON.parse(raw) as unknown, knownIds(agentSkillCatalog), defaultDownloadedSkillIds);
  } catch {
    return defaultDownloadedSkillIds;
  }
}

/** Persists locally downloaded skill ids for the Skill Hub page. */
export function writeDownloadedSkillIds(storage: BuilderStorage | null | undefined, skillIds: string[]): void {
  storage?.setItem(SKILL_HUB_STORAGE_KEY, JSON.stringify(normalizeIds(skillIds, knownIds(agentSkillCatalog), defaultDownloadedSkillIds)));
}
