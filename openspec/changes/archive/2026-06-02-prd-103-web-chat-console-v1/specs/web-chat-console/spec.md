## ADDED Requirements

### Requirement: Web Chat Console MUST use BFF APIs only
Web Chat Console MUST 通过 BFF `/api/*` 访问 agent 能力，不得直接调用 agent runtime、agent service 或读取 agent 本地运行文件。

#### Scenario: Web loads health and sessions through BFF
- **WHEN** Web Chat Console 初始化
- **THEN** 它调用 BFF health 与 sessions API
- **AND** 页面显示连接状态和 session 列表

#### Scenario: Web does not read local agent files
- **WHEN** Web Console 运行在 Vite dev 环境
- **THEN** `/api/*` 请求通过 proxy 转发到 BFF
- **AND** Vite config 不再读取 `.tasks`、`.runtime` 或 `.observability` 文件

### Requirement: Web Chat Console MUST support the core chat workflow
Web Chat Console MUST 支持本地开发使用的最小 chat 闭环：创建 session、选择 session、读取 transcript、发送 message、展示 assistant 回复。

#### Scenario: User creates and selects a session
- **WHEN** 用户点击新建 session
- **THEN** Web 调用 `POST /api/sessions`
- **AND** 新 session 出现在左侧列表并成为当前 session

#### Scenario: User sends a message
- **WHEN** 用户在当前 session 输入 message 并提交
- **THEN** Web 调用 `POST /api/sessions/:id/messages`
- **AND** 请求体包含用户 message
- **AND** 请求完成后刷新当前 transcript

#### Scenario: User switches sessions
- **WHEN** 用户选择左侧另一个 session
- **THEN** Web 调用 `GET /api/sessions/:id`
- **AND** 中间 Chat 主区显示该 session 的 transcript

### Requirement: Web Chat Console MUST expose clear runtime states
Web Chat Console MUST 清晰展示 loading、busy、empty、error 和 disconnected 状态，避免用户无法判断 agent 是否可用或请求是否仍在执行。

#### Scenario: Agent or BFF is unavailable
- **WHEN** health 或 sessions API 请求失败
- **THEN** 顶部状态栏显示 disconnected
- **AND** 页面提供重试入口

#### Scenario: Message is being sent
- **WHEN** message 请求进行中
- **THEN** 输入提交按钮进入 disabled/loading 状态
- **AND** 当前 session 标记为 busy 或 sending

#### Scenario: Session has no transcript
- **WHEN** 当前 session 没有 messages
- **THEN** Chat 主区显示空状态和可操作的输入框
