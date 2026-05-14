# skill-loading-runtime Specification

## Purpose
定义本地 skill discovery / loading runtime，包括 workspace roots 扫描、frontmatter 解析、tool surface 和 CLI/TUI inspection surface。

## Requirements
### Requirement: Agent SHALL discover local skills from stable workspace roots
系统 SHALL 从稳定的本地 roots 发现 `SKILL.md` 文件，并将其解析为可列举、可加载的 skill catalog，而不是继续只保留空的 `skills` prompt section。

#### Scenario: User launches CLI from a workspace subdirectory
- **WHEN** 用户在仓库子目录启动 CLI
- **THEN** 系统仍能向上发现工作区根目录下的 `.codex/skills` 或 `skills` 目录
- **AND** 返回稳定的本地 skill catalog

#### Scenario: Skill metadata is parsed from frontmatter
- **WHEN** 某个 `SKILL.md` 含有 frontmatter `name` / `description`
- **THEN** 系统读取这些基础元数据
- **AND** skill body 保持为可独立加载的正文内容

### Requirement: Agent SHALL expose local skill discovery and load tools
系统 SHALL 提供 `list_skills` 与 `load_skill(name)`，让模型和本地控制面都能稳定发现与读取 skill。

#### Scenario: Model lists local skills
- **WHEN** 模型调用 `list_skills`
- **THEN** 系统返回本地 skill 列表
- **AND** 每项至少包含 `name`、`description`、`path` 与 loaded 状态

#### Scenario: Model loads one local skill by name
- **WHEN** 模型调用 `load_skill(name)`
- **THEN** 系统返回该 skill 的完整正文与基础元数据
- **AND** 不要求该 skill 已经注入主 prompt

#### Scenario: Missing skill returns a stable error
- **WHEN** 模型调用 `load_skill(name)` 且本地不存在该名称
- **THEN** 系统返回稳定的 `SKILL_NOT_FOUND` 错误
- **AND** 不抛出未结构化异常

### Requirement: CLI and TUI SHALL expose local skill inspection surfaces
CLI / TUI SHALL 提供本地 skill inspection surface，让用户无需进入模型请求链路即可查看 skill catalog 和单个 skill 正文。

#### Scenario: User lists discovered local skills
- **WHEN** 用户输入 `/skills`
- **THEN** 系统展示当前发现到的 skills
- **AND** 明确标出哪些 skills 已经进入当前稳定 prompt

#### Scenario: User opens one skill body locally
- **WHEN** 用户输入 `/skill <name>`
- **THEN** 系统展示该 skill 的 path、metadata 与正文内容
- **AND** 不进入模型请求链路
