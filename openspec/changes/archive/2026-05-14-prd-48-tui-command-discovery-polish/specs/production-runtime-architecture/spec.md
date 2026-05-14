## ADDED Requirements

### Requirement: CLI and TUI MUST provide scoped help topics for common local workflows
CLI / TUI MUST 提供按工作流分层的帮助主题，避免所有本地命令只通过单一长列表暴露。

#### Scenario: User requests draft help
- **WHEN** 用户输入 `/help draft`
- **THEN** 输出聚焦 composer / draft 相关命令
- **AND** 至少包含一条可直接执行的示例

#### Scenario: User requests session help
- **WHEN** 用户输入 `/help sessions`
- **THEN** 输出聚焦 session 选择、切换与导航命令
- **AND** 不要求用户先阅读整份全量命令清单

### Requirement: TUI guide surfaces MUST prioritize context-relevant actions
TUI 的 guide / controls 面 MUST 优先展示和当前状态最相关的本地动作，而不是把所有命令长期平铺在同一个面板里。

#### Scenario: Composer mode is active in TUI
- **WHEN** 用户在 TUI 中处于 composer 模式
- **THEN** guide 面优先展示 `/preview`、`/send`、`/pop`、`/cancel` 等草稿动作
- **AND** 明确给出 help 或快捷键入口

#### Scenario: Default TUI mode is active
- **WHEN** 用户在 TUI 中未处于 composer 模式
- **THEN** guide 面优先展示帮助入口、会话导航和状态查看类动作
- **AND** 保持信息密度紧凑，不依赖超长静态命令墙

### Requirement: TUI MUST expose a dedicated keyboard entry for local help
TUI MUST 提供专用本地 help 快捷入口，让用户无需输入完整 slash command 即可查看帮助。

#### Scenario: Prompt buffer is empty
- **WHEN** 用户在 TUI 中按下 `Ctrl+G`
- **THEN** 系统展示本地帮助输出
- **AND** 不进入模型请求链路

#### Scenario: Prompt buffer is not empty
- **WHEN** 用户已经在 prompt 中输入正文内容
- **THEN** `Ctrl+G` 不应抢占当前正文输入
- **AND** 用户可以继续完成当前输入
