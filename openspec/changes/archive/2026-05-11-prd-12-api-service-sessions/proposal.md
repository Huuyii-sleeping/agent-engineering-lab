## Why

当前 Agent 仍然主要通过本地 CLI 交互，虽然 `apps/web-console` 已有只读 API，但它只能查看运行状态，外部系统无法正式通过服务接口调用 Agent 完成任务。

PRD-12 的第一阶段需要先补齐最小产品化服务层：
- 提供标准 HTTP 接口而不是只读开发中间件
- 支持多 session 并发，且每个 session 独立持有历史和运行时状态
- 让外部系统可以通过 `/chat` 端到端调用 Agent

插件生命周期管理和部署模板留到 PRD-12 后续子阶段，不和服务层一起膨胀范围。

## What Changes

- 新增 `agent-service` 服务层和 HTTP server
- 新增 `/health`、`/tools`、`/sessions`、`/chat` 接口
- 引入 session manager，保证每个会话拥有独立 history 和 runtimeState
- 将 `compact/estimate_tokens` 的运行时上下文从全局改为按执行绑定，避免并发 session 串上下文
- 新增 API/service 单测和 PRD-12 smoke

## Capabilities

### New Capabilities

- `agent-service-sessions`: 定义面向外部系统的 HTTP 服务接口与会话隔离能力

### Modified Capabilities

- `core-agent-loop`: 主循环的 context tool 运行时上下文不再依赖单一全局变量

## Impact

- 影响代码：
  - 新增 `apps/agent-cli/src/agent-service.ts`
  - 新增 `apps/agent-cli/src/server.ts`
  - `apps/agent-cli/src/tools/base.ts`
  - `apps/agent-cli/src/cli.ts`
- 影响测试：
  - 新增 `agent-service` 单测
  - 新增 PRD-12 service API smoke
- Out of Scope：
  - 插件安装/启停/签名
  - Docker 化与部署模板
