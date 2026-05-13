## Context

PRD-41 已经让 Agent CLI 具备多入口分流，但其中 TUI、Remote/Bridge 和 inbound MCP 管理面仍是最小或缺失状态。现有 `AgentService` 已经是最合适的共享服务边界，因此本轮所有新表面都围绕它扩展，而不是直接接触 QueryEngine。

## Goals / Non-Goals

**Goals:**

- 给终端用户一个比纯 REPL 更可控的 TUI 控制台。
- 给远端客户端一个可发现、可订阅的 bridge surface。
- 给 MCP client 一个完整一些的 Agent 管理工具集。
- 保持入口 adapter 薄，核心 runtime 不变。

**Non-Goals:**

- 不做完整图形 TUI。
- 不做远端身份认证与权限模型。
- 不把 MCP server 变成独立 daemon 管理平台。

## Decisions

### Decision 1: TUI 先用零依赖 ANSI/readline 控制台

采纳：

- 新增 `entrypoints/tui.ts`，实现命令式控制台和可测试的 dashboard renderer。

不采用：

- 现在安装 Ink/React。

原因：

- 当前环境网络受限，且 TUI 底座更需要稳定 runtime 复用。零依赖方案能先打通入口和会话控制。

### Decision 2: Remote bridge 以 AgentService event bus + SSE 起步

采纳：

- AgentService 暴露 subscribe/unsubscribe。
- HTTP service 新增 `/bridge`、`/sessions/:id`、`/events`。

不采用：

- WebSocket 或自定义二进制协议。

原因：

- 当前依赖中没有 `ws`，SSE 可以用 Node HTTP 原生能力完成，适合实时事件流底座。

### Decision 3: MCP management tools 复用 AgentService 方法

采纳：

- 在 MCP server adapter 中暴露 session/tool 管理工具，全部通过 AgentServiceLike 调用。

不采用：

- 让 MCP server 直接读写 session map。

原因：

- AgentService 是跨 HTTP、TUI、MCP 的共享边界；保持单一状态来源能减少后续远端一致性问题。

## Risks / Trade-offs

- [Risk] TUI 仍不等同于成熟 React/Ink UI -> Mitigation：本轮先实现可用控制台，后续可以在相同 service boundary 上替换成更强 UI。
- [Risk] SSE 无认证不适合公网 -> Mitigation：本轮明确只作为本地/内网 bridge 底座。
- [Risk] MCP 工具面扩大后协议漂移 -> Mitigation：focused tests 覆盖 tool list、session tools 和未知工具。
