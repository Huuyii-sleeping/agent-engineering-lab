## Why

对照 `liuup/claude-code-analysis` 的架构总览，当前仓库的核心 runtime、tool、memory、MCP client、HTTP service 等层已经基本齐备，但入口层仍有明显缺口：`main.ts` 直接进入交互 CLI，缺少轻量 argv 分流，也没有把 headless 单次执行和 Agent 自身作为 MCP server 的入口纳入统一入口拓扑。

本轮补齐入口层，目标是让仓库更接近“轻入口分流 + 共享 bootstrap + 多交互表面复用 QueryEngine”的架构形态。

## What Changes

- 新增 PRD-41，记录对照外部架构分析后的缺口与本轮范围。
- 新增 CLI dispatcher，支持 fast flag、交互 CLI、HTTP server、headless print、stdio MCP server 的统一入口分流。
- 新增 headless 单次 query 入口，复用 `runUserQuery` 和共享 runtime app 装配。
- 新增 Agent MCP server adapter，通过 stdio MCP JSON-RPC 暴露 `agent_chat` 工具。
- 调整 `server.ts` 为可被 dispatcher 复用，同时保持直接运行 `dist/server.js` 的行为。
- 增加 focused unit tests 覆盖入口解析、headless 输出和 MCP server 工具协议。

## In Scope

- 只实现入口层与 adapter 层能力。
- 复用现有 `createAgentAppRuntime`、`AgentService`、`QueryEngine`、`runUserQuery`。
- MCP server 暴露最小可用 `agent_chat` 工具，支持 `initialize`、`tools/list`、`tools/call` 和 initialized notification。

## Out of Scope

- 不实现 React/Ink TUI 或复杂 AppState UI。
- 不实现 Remote/Bridge 远端会话传输。
- 不改变现有模型请求、工具执行、安全审批、memory、hook、scheduler 的行为。
- 不引入新的 MCP SDK 依赖。

## Impact

- 影响代码：
  - `apps/agent-cli/src/main.ts`
  - `apps/agent-cli/src/server.ts`
  - `apps/agent-cli/src/entrypoints/*`
  - `apps/agent-cli/package.json`
  - focused tests
- 影响文档：
  - 新增 `PRD-41`
  - 新增 OpenSpec change
