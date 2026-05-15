# PRD-64 daemon MCP 复用

## 背景

当前 `agent-cli tui` 已经能复用 daemon，但 `agent-cli mcp-server` 还没有接到共享宿主上。同时，daemon 探测和 client 初始化逻辑还停留在 TUI 入口内联状态，没有沉成共享接入层。

## 目标

- 抽取共享 daemon client resolver。
- 让 `agent-cli mcp-server` 在 daemon 可用时优先 attach。
- 保留 daemon 不可用时的 embedded fallback。

## In Scope

- daemon-backed MCP reuse
- 共享 daemon client resolver
- MCP 所需的远端 session detail / createSession 面

## Out of Scope

- 新增新的 MCP tool 能力
- 交互式 CLI attach

## 验收标准

- `agent-cli mcp-server` 在 daemon 可用时优先 attach 到共享宿主。
- attach 失败或 daemon 不可用时，MCP 入口自动回退 embedded host。
- daemon 探测与 client 初始化不再只存在于 TUI 入口内联逻辑中。
