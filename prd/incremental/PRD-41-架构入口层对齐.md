# PRD-41 架构入口层对齐

## 背景

对照 `https://github.com/liuup/claude-code-analysis/blob/main/analysis/01-architecture-overview.md`，当前仓库已经覆盖大部分核心运行时能力：

- 共享 runtime composition root：`bootstrap/app-runtime.ts`
- UI independent query runtime：`runtime/query-engine.ts`、`runUserQuery`
- 工具注册、执行、安全、MCP client、subagent、memory、hook、scheduler
- HTTP service：`AgentService` 与 `server.ts`

尚未显式实现的重点缺口在入口层：

- 缺少轻量 CLI dispatcher，`main.ts` 直接进入交互 CLI。
- 缺少 headless `--print` 风格单次 query 入口。
- 缺少 Agent 自身作为 inbound MCP server 暴露给外部 MCP client 的入口。

## 目标

- 让入口层先做轻量 argv 分流，再按需加载具体 runtime。
- 保持默认交互 CLI 行为不变。
- 增加 headless 单次执行能力，复用现有 query runtime。
- 增加最小可用 stdio MCP server，暴露 `agent_chat` 工具。

## In Scope

- `--help` / `--version` fast path。
- 默认无参数进入交互 CLI。
- `server` / `--server` 启动 HTTP service。
- `--print` / `-p` / `print` 执行一次性 prompt。
- `mcp-server` / `--mcp-server` 启动 stdio MCP server。
- focused unit tests 与 build 验证。

## Out of Scope

- React/Ink TUI。
- Remote/Bridge 远端传输。
- 完整 MCP server 管理面。
- 模型、工具、安全、memory、hook、scheduler 的语义变更。

## 验收标准

- 执行 fast flags 不初始化 runtime。
- 默认 CLI 行为保持兼容。
- headless print 能返回 assistant 文本，hook block 时返回非零退出码。
- MCP server 支持 `initialize`、`tools/list`、`tools/call(agent_chat)`。
- focused tests 和 TypeScript build 通过。
