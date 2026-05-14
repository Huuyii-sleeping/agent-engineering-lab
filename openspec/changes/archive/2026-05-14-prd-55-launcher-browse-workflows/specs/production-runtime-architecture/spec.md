## ADDED Requirements

### Requirement: CLI and TUI MUST expose a local workflow switcher for surface-level modes
CLI / TUI MUST 提供本地 workflow switcher，让用户可以在通用 Agent surface 与 draw-oriented surface 之间切换，而不必分散依赖不同命令入口。

#### Scenario: User switches the local workflow surface
- **WHEN** 用户输入 `/workflow draw` 或 `/workflow agent`
- **THEN** 系统切换当前本地 workflow surface
- **AND** 不进入模型请求链路

#### Scenario: Workflow-aware surfaces reflect the active local mode
- **WHEN** 用户已经切换到某个本地 workflow
- **THEN** CLI / TUI 的 prompt、banner、guide、palette 或 footer 至少一处反映当前 workflow
- **AND** 用户可以通过统一入口切回其他 workflow

## MODIFIED Requirements

### Requirement: CLI and TUI MUST expose a local command palette for high-frequency actions
CLI / TUI MUST 提供本地 command palette，让用户不必先记住完整命令再输入。

#### Scenario: User opens the command palette
- **WHEN** 用户输入 `/palette` 或在 TUI 中触发 palette 快捷入口
- **THEN** 系统展示高频本地动作候选
- **AND** 不进入模型请求链路

#### Scenario: User fuzzy-searches palette candidates
- **WHEN** 用户输入 `/palette review`
- **THEN** 系统返回与该查询最相关的本地候选
- **AND** 候选可以来自 workflow、help、session、transcript 或 runtime 控制面

#### Scenario: User scans grouped palette results
- **WHEN** 用户查看 palette 结果
- **THEN** 系统按稳定分组展示候选
- **AND** 同组候选保持局部相关度排序，而不是完全无结构的长列表

### Requirement: TUI local command palette MUST expose a dedicated selection surface
TUI 本地 command palette MUST 提供独立的选择面，而不是只输出静态文本结果。

#### Scenario: User opens the palette panel
- **WHEN** 用户通过 `/palette` 或 `Ctrl+K` 打开本地 palette
- **THEN** TUI 展示顶部 `Command Bar`
- **AND** TUI 以紧凑结果浮层块展示候选，而不是继续侵入主会话区

#### Scenario: User moves the current selection
- **WHEN** palette panel 已打开
- **THEN** 用户可以通过 `Up` / `Down` 或 `Ctrl+N` / `Ctrl+P` 切换当前选中候选
- **AND** 不进入模型请求链路

#### Scenario: User scans grouped compact palette results
- **WHEN** palette 已打开且用户查看当前候选
- **THEN** TUI 在结果中明确展示分组与 query 命中
- **AND** command bar 展示当前选中候选的 preview summary 与操作提示

### Requirement: CLI and TUI MUST provide local transcript browsing for the active session
CLI / TUI MUST 提供当前 session 的本地 transcript 浏览能力，避免用户只能查看最近几条对话。

#### Scenario: User enters transcript history mode
- **WHEN** 用户输入 `/history`
- **THEN** 系统展示当前 session transcript 的结构化窗口
- **AND** 明确给出翻页、展开或返回 tail 的下一步入口

#### Scenario: User jumps to transcript edges
- **WHEN** 用户输入 `/history first` 或 `/history last`
- **THEN** 系统分别跳到最早或最新的 transcript window
- **AND** 保持同一套本地浏览状态

#### Scenario: User returns to live tail mode
- **WHEN** 用户输入 `/tail`
- **THEN** 系统回到最近消息 tail 视图
- **AND** TUI Conversation panel 恢复 live tail 展示

### Requirement: Local transcript browsing MUST support search and single-entry expansion
本地 transcript 浏览 MUST 支持搜索匹配和单条消息展开，避免长会话只能粗略翻页。

#### Scenario: User searches the current transcript
- **WHEN** 用户输入 `/search bug`
- **THEN** 系统返回命中该查询的 transcript 条目摘要
- **AND** 输出至少包含可用于展开单条结果的 entry index

#### Scenario: User moves across search matches
- **WHEN** 用户已经进入 transcript search 状态并输入 `/search next` 或 `/search prev`
- **THEN** 系统切换当前 match focus
- **AND** 保持相同 query 的本地搜索结果上下文

#### Scenario: User expands one transcript entry
- **WHEN** 用户输入 `/peek 12`
- **THEN** 系统展示第 12 条 transcript entry 的完整内容
- **AND** 保留该条 entry 的 role、索引和基本摘要

#### Scenario: User moves across adjacent expanded entries
- **WHEN** 用户已经处于 transcript peek 状态并输入 `/peek next` 或 `/peek prev`
- **THEN** 系统切换到相邻 transcript entry
- **AND** 保持展开视图而不是退回列表
