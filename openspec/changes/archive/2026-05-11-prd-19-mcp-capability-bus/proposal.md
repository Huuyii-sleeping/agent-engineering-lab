## Why

当前 `apps/agent-cli` 的工具面只覆盖原生工具与 `subagent_*`，外部能力尚未进入统一控制面。后续如果要接入 MCP server 或其他外部工具能力，现有主循环、工具路由、安全策略和可观测链路都没有统一入口，意味着每新增一个外部能力都要手工修改主流程，既不稳定，也不利于测试。

PRD-19 的目标是先建立一个最小可用的 MCP 与外部能力总线：让外部 server 可以通过配置接入，让模型在同一轮中像调用原生工具一样调用外部工具，同时保持统一的权限边界、可观测性和失败返回契约。

## What Changes

- 新增最小 MCP stdio client，负责外部 server 启动、初始化、`tools/list`、`tools/call` 与失败回收。
- 新增配置化 MCP server 注册入口，从项目配置中加载外部 server，而不是把外部工具硬编码到主循环。
- 改造统一 tool router，让工具调用可在 native / subagent / MCP 三类能力之间分流。
- 为 MCP 工具接入统一安全门禁、结构化错误、观测事件与有限重试。
- 补充单测与 smoke，用例覆盖 native + MCP 同轮调度、失败路径与权限边界。

## Capabilities

### New Capabilities

- `mcp-external-capability-bus`: 定义 MCP server 配置、工具注册、生命周期管理与统一调用契约。

### Modified Capabilities

- `core-agent-loop`: 主循环工具面从“原生 + subagent”扩展为“原生 + subagent + MCP 外部工具”。

## Impact

- 影响代码：
  - `apps/agent-cli/src/tools/index.ts`
  - 可能新增 `apps/agent-cli/src/tools/mcp.ts` 或等效模块
  - `apps/agent-cli/src/cli.ts`
  - `apps/agent-cli/src/agent-service.ts`
  - `apps/agent-cli/src/tools/security.ts`
  - `apps/agent-cli/src/runtime-config.ts`
- 影响配置：
  - 新增项目级 MCP server 配置文件，例如 `.codex/mcp.json`
- 影响测试：
  - 新增 MCP unit / smoke
  - 更新发布检查命令
