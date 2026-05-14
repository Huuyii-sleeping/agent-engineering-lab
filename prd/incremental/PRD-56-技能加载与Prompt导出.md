# PRD-56 技能加载与 Prompt 导出

## 目标

补齐参考架构页里仍然缺失的两块真实能力面：本地 skills 加载链路，以及不进入模型请求链路的 system prompt 导出入口。

## 范围（In Scope）

- 本地 `SkillLoader`：
  - 扫描 `.codex/skills/**/SKILL.md`
  - 扫描 `skills/**/SKILL.md`
  - 支持通过 `AGENT_SKILL_ROOTS` 增加额外 roots
  - 解析 frontmatter 基础元数据
- skill 工具能力：
  - `list_skills`
  - `load_skill(name)`
- skills prompt 注入：
  - `AGENT_SKILLS=name1,name2`
  - `AGENT_SKILLS=all`
- 本地 CLI / TUI inspection surface：
  - `/skills`
  - `/skill <name>`
  - `/prompt`
- 轻量入口：
  - `agent-cli dump-system-prompt`
  - `agent-cli --dump-system-prompt`

## 非目标（Out of Scope）

- 完整插件安装、签名和热重载生命周期。
- 远端 skill marketplace。
- 动态 prompt DSL 或 prompt cache。

## 功能要求

- skill discovery 不能只停留在 prompt section 预留字段，必须能真正扫描并加载本地技能正文。
- skills 默认不强制全部注入主 prompt，避免无控制地膨胀 token。
- prompt dump 必须走本地 inspection surface，不进入模型请求链路。
- CLI / TUI 的 help、completion、palette 需要同步暴露 skill / prompt inspection 入口。
- 从子目录启动 CLI 时，也应能向上发现工作区根目录下的 `.codex/skills`。

## 验收标准（AC）

- AC-56-1：`list_skills` 能返回本地发现到的技能列表与 loaded 状态。
- AC-56-2：`load_skill(name)` 能按名称返回完整技能正文。
- AC-56-3：`/skills`、`/skill <name>`、`/prompt` 都不进入模型请求链路。
- AC-56-4：`agent-cli dump-system-prompt` 能直接输出当前稳定 system prompt。
- AC-56-5：`AGENT_SKILLS` 可控制哪些技能进入最终稳定 prompt。

## 实施顺序

1. 先补 `SkillLoader`、prompt inspect 和 `dump-system-prompt` 入口。
2. 再接 `list_skills` / `load_skill` 工具与 skills prompt 注入。
3. 最后同步 CLI / TUI help、palette、completion、tests 和规格文档。
