## MODIFIED Requirements

### Requirement: Web Chat Console MUST support the core chat workflow
Web Chat Console MUST 支持本地开发使用的最小 chat 闭环：创建 session、选择 session、读取 transcript、发送 message、展示 assistant 回复，并在可用时通过 SSE 同步运行时变化。

#### Scenario: User creates and selects a session
- **WHEN** 用户点击新建 session
- **THEN** Web 调用 `POST /api/sessions`
- **AND** 新 session 出现在左侧最近历史列表并成为当前 session

#### Scenario: User sends a message
- **WHEN** 用户在当前 session 输入 message 并提交
- **THEN** Web 调用 `POST /api/sessions/:id/messages`
- **AND** 请求体包含用户 message
- **AND** 请求完成后刷新当前 transcript

#### Scenario: Runtime emits SSE events
- **WHEN** BFF `/api/events/stream` 推送 agent 事件
- **THEN** Web 刷新 session 列表
- **AND** 如果当前 session 仍处于选中状态，Web 刷新当前 transcript

### Requirement: Web Chat Console MUST expose clear runtime states
Web Chat Console MUST 清晰展示 loading、busy、empty、error、disconnected 和 SSE 连接状态，避免用户无法判断 agent 是否可用或请求是否仍在执行。

#### Scenario: Agent or BFF is unavailable
- **WHEN** health 或 sessions API 请求失败
- **THEN** 顶部状态栏显示 disconnected
- **AND** 页面提供重试入口

#### Scenario: SSE stream is unavailable
- **WHEN** Web 无法建立或维持 SSE 连接
- **THEN** 页面显示轻量的 stream disconnected 状态
- **AND** 基础 Chat 请求仍可继续使用

### Requirement: Web Chat Console MUST provide a polished Chat-first layout
Web Chat Console MUST present a modern Chat-first interface with left navigation/history, central transcript, and a persistent composer while preserving the existing BFF-backed workflow.

#### Scenario: User opens the Web Chat Console
- **WHEN** the Web Console loads
- **THEN** the page shows a left navigation/history rail
- **AND** the center area shows the active conversation or empty Chat state
- **AND** the composer remains available at the bottom of the Chat area
- **AND** visible command controls prefer recognizable icons over repeated text labels

#### Scenario: User toggles the sidebar
- **WHEN** 用户点击左上角侧栏按钮
- **THEN** Web 折叠或展开左侧导航与历史区域
- **AND** 当前 session、草稿和 transcript 不丢失

#### Scenario: User scans history
- **WHEN** Web 显示历史对话
- **THEN** 历史列表只展示最近 3 条 session
- **AND** session 按更新时间从新到旧排序

### Requirement: Web Chat Console MUST render readable chat content
Web Chat Console MUST render assistant, system, and tool message content as Markdown while preserving user message text readability.

#### Scenario: Assistant returns Markdown
- **WHEN** assistant message contains Markdown headings, lists, code, links, or blockquotes
- **THEN** Web renders the content with readable Markdown styles
- **AND** links are safe external links

#### Scenario: User message is displayed
- **WHEN** user message appears in the transcript
- **THEN** Web keeps the compact user bubble style and preserves line breaks
