## Context

当前仓库已经是 `apps/*` pnpm monorepo，已有 `apps/agent-cli` 和 `apps/web-console`。`agent-cli` 内部已经有 HTTP service、AgentServiceClient、sessions/chat/events 等能力；`web-console` 当前通过 Vite middleware 读取本地运行文件，这不适合作为后续 Web 产品的长期边界。

本变更新增 `apps/bff`，让浏览器只调用 BFF，BFF 再调用 agent HTTP service。BFF 不拥有 agent runtime，不直接读取 agent 本地文件，不直接执行工具。

## Goals / Non-Goals

**Goals:**
- 建立清晰三层结构：`web-console -> bff -> agent service -> harness`。
- 新增 BFF app，暴露 Web-facing `/api/*`。
- BFF 通过 HTTP 转发到 agent service，统一 JSON 错误格式和 CORS/OPTIONS。
- 支持 session、message、transcript、SSE events、audit events、security findings 的最小 v1 API。
- 给 agent service 增加 audit/security 只读 endpoint，避免 BFF 直接访问本地文件。
- 提供 BFF 测试，证明转发路径和错误处理可用。

**Non-Goals:**
- 不实现认证、多租户、组织权限或云部署。
- 不引入数据库。
- 不重命名 `apps/agent-cli`。
- 不改 Web UI 页面。
- 不让 BFF 拼 prompt、执行工具或改变 agent runtime 行为。
- 不实现 WebSocket。

## Decisions

1. 新增 `apps/bff`，而不是把 BFF 塞进 `web-console` Vite middleware。
   - 理由：BFF 是后端边界，应能独立 build/test/start，未来可部署在 Web 前面。
   - 备选：继续使用 Vite middleware。未采用，因为它只适合开发期，不适合生产边界。

2. BFF 使用 Node HTTP server 与内置 `fetch`，不新增 Express/Fastify。
   - 理由：v1 路由很少，标准库足够；减少依赖和维护面。
   - 备选：使用 Fastify。未采用，因为当前需求没有插件生态、schema pipeline 或复杂 middleware 需求。

3. BFF 只调用 agent HTTP service，不导入 agent runtime 源码。
   - 理由：保持进程边界清晰，避免 Web 后端和 agent harness 强耦合。
   - 备选：BFF 直接 import `AgentService`。未采用，因为会把 agent runtime 生命周期、cwd、本地文件和工具权限带进 BFF。

4. audit/security 数据通过 agent service 新增只读 endpoint 暴露。
   - 理由：数据属于 agent 本地治理面，读取策略应由 agent service 统一控制。
   - 备选：BFF 直接读取 `.audit` 和 `.security` 文件。未采用，因为会绕过 agent 的脱敏、retention 和未来权限控制。

5. events v1 使用 SSE 转发。
   - 理由：agent service 已有 `/events` SSE；BFF 转发即可满足 Web 实时更新，不需要 WebSocket。
   - 备选：改成 WebSocket。未采用，因为范围更大且当前没有双向实时协议需求。

## Risks / Trade-offs

- [Risk] BFF 与 agent service endpoint 可能漂移。→ BFF 测试使用 mock upstream 验证路径和 body 映射；agent service 保持原 endpoint 稳定。
- [Risk] BFF 只是转发，短期功能看起来少。→ 这是有意边界，v1 先建立稳定入口，后续 Web 需求再增量聚合。
- [Risk] 无认证时本地 BFF 不适合暴露公网。→ v1 明确只作为本地开发/控制台 BFF，不做公网部署假设。
- [Risk] SSE 转发可能被代理缓冲。→ v1 设置 no-store 和 text/event-stream；部署层优化留到后续。

## Migration Plan

1. 新增 `apps/bff` package，不影响现有 `agent-cli` 和 `web-console`。
2. 根脚本增加 `dev:bff`、`build:bff`、`test:bff`。
3. 后续 Web Console 改造时，把前端 `/api/*` 指向 BFF，而不是 Vite middleware 或 agent service。
