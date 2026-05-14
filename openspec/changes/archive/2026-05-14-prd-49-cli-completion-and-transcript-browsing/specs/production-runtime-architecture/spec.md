## ADDED Requirements

### Requirement: CLI and TUI MUST provide local command completion for high-frequency control commands
交互 CLI / TUI MUST 提供本地命令补全，降低 slash command 与常见参数的输入成本。

#### Scenario: User completes a help topic
- **WHEN** 用户输入 `/help d` 并触发补全
- **THEN** 系统补全为 `/help draft` 或给出对应候选
- **AND** 不进入模型请求链路

#### Scenario: User completes a session selector
- **WHEN** 用户输入 `/use ` 并触发补全
- **THEN** 系统给出可用 session index、`latest` 或已知 session id 候选
- **AND** 只使用本地 session 状态

### Requirement: CLI and TUI MUST provide local transcript browsing for the active session
CLI / TUI MUST 提供当前 session 的本地 transcript 浏览能力，避免用户只能查看最近几条对话。

#### Scenario: User enters transcript history mode
- **WHEN** 用户输入 `/history`
- **THEN** 系统展示当前 session transcript 的结构化窗口
- **AND** 明确给出翻页、展开或返回 tail 的下一步入口

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

#### Scenario: User expands one transcript entry
- **WHEN** 用户输入 `/peek 12`
- **THEN** 系统展示第 12 条 transcript entry 的完整内容
- **AND** 保留该条 entry 的 role、索引和基本摘要
