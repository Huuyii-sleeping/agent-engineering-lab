## Why

PRD-41 已经补齐轻量入口分流、headless print 和最小 inbound MCP server。用户明确希望继续实现剩余缺口，目标不是只“像 Claude Code”，而是形成一个更强的多表面 Agent 运行平台。

本轮把此前 Out of Scope 的三块能力推进到可用底座：终端 TUI 控制台、远端 bridge 事件通道、完整一些的 inbound MCP 管理工具集。

## What Changes

- 新增终端 TUI 控制台入口，提供会话、工具、远端 bridge 状态和命令式 chat 控制。
- 扩展 HTTP service 为 remote bridge，增加 bridge manifest、session detail 和 SSE event stream。
- 扩展 inbound MCP server，从单一 `agent_chat` 增加 session/tool 管理工具。
- 更新 CLI dispatcher、scripts、focused tests 和 OpenSpec/PRD 文档。

## In Scope

- `tui` / `--tui` 入口。
- TUI 命令：`/help`、`/new`、`/sessions`、`/tools`、`/use <session_id>`、`/exit`，普通输入走 chat。
- HTTP bridge endpoint：`GET /bridge`、`GET /sessions/:id`、`GET /events`。
- AgentService 事件订阅，用于 chat/session bridge event。
- MCP tools：`agent_chat`、`agent_create_session`、`agent_list_sessions`、`agent_get_session`、`agent_list_tools`。

## Out of Scope

- 不引入 React/Ink 依赖。
- 不实现浏览器端实时 UI。
- 不做公网 tunnel、认证、多租户或加密传输。
- 不改变现有 QueryEngine、工具执行、安全审批和 memory 语义。

## Impact

- 影响代码：
  - `apps/agent-cli/src/agent-service.ts`
  - `apps/agent-cli/src/agent-service-sessions.ts`
  - `apps/agent-cli/src/entrypoints/*`
  - `apps/agent-cli/package.json`
  - focused tests
- 影响文档：
  - 新增 `PRD-42`
  - 新增 OpenSpec change
