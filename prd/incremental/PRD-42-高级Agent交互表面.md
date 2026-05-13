# PRD-42 高级 Agent 交互表面

## 背景

PRD-41 已补齐轻量入口分流、headless print 与最小 inbound MCP server。用户希望继续实现此前未覆盖的 TUI、Remote/Bridge 和更完整 MCP 管理面，目标是构建一个接近 Claude Code 且可继续增强的 Agent 平台。

## 目标

- 提供终端 TUI 控制台，支持会话和工具管理。
- 提供 HTTP remote bridge，支持发现、session detail 和实时事件流。
- 扩展 inbound MCP server，使外部 MCP client 能管理 session 和查询工具。

## In Scope

- `tui` / `--tui` CLI 模式。
- TUI 命令式控制台：`/help`、`/new`、`/sessions`、`/tools`、`/use <session_id>`、`/exit`。
- HTTP endpoints：`GET /bridge`、`GET /sessions/:id`、`GET /events`。
- AgentService event subscription。
- MCP tools：`agent_chat`、`agent_create_session`、`agent_list_sessions`、`agent_get_session`、`agent_list_tools`。

## Out of Scope

- 完整 React/Ink TUI。
- 浏览器实时控制台。
- 公网 tunnel、鉴权、多租户。
- 修改 QueryEngine 或工具执行核心语义。

## 验收标准

- TUI dashboard 能显示 session/tool/bridge 状态。
- TUI 普通输入通过 AgentService.chat 运行。
- HTTP bridge 可返回 manifest、session transcript，并通过 SSE 推送 session/chat 事件。
- MCP server 能列出并执行 session/tool 管理工具。
- focused tests、build、OpenSpec strict 均通过。
