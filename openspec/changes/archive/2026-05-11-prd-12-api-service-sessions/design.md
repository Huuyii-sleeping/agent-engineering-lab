## Context

当前仓库已有两类入口：
- `src/main.ts` / `src/cli.ts`：交互式 CLI
- `apps/web-console/vite.config.ts`：只读开发 API

但它们都不适合外部系统正式集成：
- CLI 无法作为标准服务协议接入
- web-console API 依赖 Vite 中间件，且只读

本阶段目标是补一个轻量、无额外框架依赖的 HTTP 服务层，并保证多 session 下不会串 history 或 `compact` 上下文。

## Goals / Non-Goals

**Goals:**

- 提供标准 HTTP API：`/health`、`/tools`、`/sessions`、`/chat`
- 让每个 session 持有独立历史和 `AgentRuntimeState`
- 修复 `compact/estimate_tokens` 对全局 runtime context 的依赖，使其能安全用于并发 session
- 让 API smoke 能真实走一遍 HTTP 服务调用

**Non-Goals:**

- 不做 WebSocket
- 不做插件生命周期
- 不做持久化 session 存储
- 不做租户鉴权

## Decisions

### 决策 1：使用 Node 原生 `http`，不引入 Express/Fastify

原因：
- 当前服务面较小
- 避免新增依赖
- 保持与现有 CLI 运行时一致的最小部署要求

### 决策 2：服务层抽象为 `AgentService`，HTTP 只是包装

`AgentService` 负责：
- 创建 session
- 列出 session
- 执行 chat
- 列出 tools

`server.ts` 只负责把 HTTP 请求映射到这些能力。这样单测可以直接测服务对象，smoke 再测 HTTP。

### 决策 3：session 状态先保存在内存中

当前阶段只要求多 session 不串状态，不要求进程重启恢复。因此：
- `history` 和 `runtimeState` 先驻留内存
- 同一 session busy 时拒绝并发写入
- 不引入持久化/数据库复杂度

### 决策 4：将 compact runtime context 改为按执行绑定

此前 `estimate_tokens/compact` 依赖 `tools/base.ts` 中的单一全局 `runtimeContext`。这在多 session 服务模式下会串线。

本次改为：
- 使用按异步执行链绑定的 context store
- CLI 和 service 都在进入 `agentLoop` 前显式绑定当前 session 的 `messages`

## Risks / Trade-offs

- [Risk] session 只存在内存中，重启后丢失
  Mitigation：明确这是第一阶段，后续再补持久化

- [Risk] 工具侧的持久化副作用仍是全局目录
  Mitigation：本阶段 AC 聚焦“history/runtime state 不串”，不引入租户级文件隔离

- [Risk] 原生 HTTP 代码样板略多
  Mitigation：服务对象和 HTTP 包装分层，保持核心逻辑可测

## Migration Plan

1. 改造 compact runtime context 为执行作用域绑定
2. 新增 `AgentService`
3. 新增 `server.ts` 与 HTTP 路由
4. 新增 unit + smoke 测试
