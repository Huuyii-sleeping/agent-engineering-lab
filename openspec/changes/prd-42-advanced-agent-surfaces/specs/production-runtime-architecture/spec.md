## ADDED Requirements

### Requirement: Advanced entry surfaces MUST reuse AgentService
高级入口表面 MUST 复用 `AgentService` 作为共享业务边界，而不是绕过 service 直接操作 QueryEngine、session map 或 tool internals。

#### Scenario: TUI sends chat through AgentService
- **WHEN** 终端 TUI 用户输入普通消息
- **THEN** 系统通过 `AgentService.chat` 执行
- **AND** 保持与 HTTP 和 MCP 相同的 session / busy guard 语义

#### Scenario: MCP management tools use service methods
- **WHEN** MCP client 调用 session 或 tool 管理工具
- **THEN** 系统通过 AgentService 查询或创建资源
- **AND** 不直接访问内部 session map

### Requirement: Remote bridge MUST expose discovery session detail and event stream endpoints
远端 bridge MUST 暴露可发现的 manifest、session detail 和事件流 endpoint，使外部控制台可以同步 Agent 状态。

#### Scenario: Client discovers bridge capabilities
- **WHEN** 客户端请求 `GET /bridge`
- **THEN** 系统返回 bridge 名称、版本、capabilities 和 endpoints

#### Scenario: Client reads session transcript
- **WHEN** 客户端请求 `GET /sessions/:id`
- **THEN** 系统返回 session summary 和 messages
- **AND** 未找到时返回稳定 `SESSION_NOT_FOUND` 错误

#### Scenario: Client subscribes to server events
- **WHEN** 客户端请求 `GET /events`
- **THEN** 系统建立 SSE stream
- **AND** chat/session 事件以稳定 JSON payload 推送

### Requirement: Terminal TUI MUST provide a command control surface
终端 TUI MUST 提供会话、工具和 chat 的命令式控制表面，使用户不只依赖纯 REPL。

#### Scenario: User views TUI dashboard
- **WHEN** 用户启动 `tui` 入口
- **THEN** 系统展示 active session、session count、tool count 和 bridge endpoint 提示

#### Scenario: User manages sessions from TUI
- **WHEN** 用户执行 `/new`、`/sessions` 或 `/use <session_id>`
- **THEN** 系统创建、列出或切换会话
- **AND** 保持后续普通输入使用当前会话

### Requirement: Inbound MCP server MUST expose session and tool management tools
Inbound MCP server MUST 暴露 Agent chat、session 和 tool 管理工具，使外部 MCP client 能完整控制 Agent 基本运行面。

#### Scenario: MCP client lists management tools
- **WHEN** MCP client 调用 `tools/list`
- **THEN** 系统返回 `agent_chat`、`agent_create_session`、`agent_list_sessions`、`agent_get_session` 和 `agent_list_tools`

#### Scenario: MCP client manages sessions
- **WHEN** MCP client 调用 session 管理工具
- **THEN** 系统通过 AgentService 创建、列出或读取 session
- **AND** 返回 MCP text content 与 structured content
