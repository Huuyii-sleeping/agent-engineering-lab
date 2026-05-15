## Context

当前 `agent-cli` 已经具备：

- 共享 `AgentHost`
- session persistence
- daemon-backed TUI reuse
- 基于 HTTP / SSE 的远端事件流出口

但事件总线仍然挂在 `AgentService` 内部：

- `eventSubscribers` 在每个 service 实例上单独维护
- `eventCounter` 在每个 service 实例上单独递增
- 共享 host 只是共享 session，并没有真正共享事件流

这和 `AgentHost` 作为长期宿主的定位不一致，也会让多入口 attach 到同一 host 时继续带着“宿主共享、事件不共享”的裂缝。

## Goals / Non-Goals

**Goals:**

- 让 `AgentHost` 成为 session 和事件流的共同承载层。
- 让多个 `AgentService` 复用同一 host 时看到一致的事件流和递增编号。
- 保持现有 `/events`、`subscribeEvents()` 和 chat 事件语义不变。

**Non-Goals:**

- 不新增新的事件协议或事件持久化。
- 不改变现有事件类型集合。
- 不实现 scheduler / plugin runtime 的事件接入。

## Decisions

### Decision 1: 事件总线下沉到 `AgentHost`，`AgentService` 仅做代理

- 方案 A：保留 `AgentService` 自己的 subscriber / counter，只在多个 service 间做同步
- 方案 B：把 subscriber、counter 和 event emit 逻辑整体收拢到 `AgentHost`

选择：方案 B。

原因：

- `AgentHost` 本来就应该承载长期 session、生命周期和共享状态。
- 事件流和 session 一样，属于宿主级共享能力，不应继续按 service instance 切分。
- 这样后续 daemon attach、scheduler 或其他入口只要共享 host，就天然共享事件语义。

不选方案 A 的原因：

- 会继续保留“逻辑上共享 host，技术上分裂事件总线”的尴尬层。

### Decision 2: `session.created` 在 host 创建会话时直接发出，chat 相关事件仍由 service 驱动

- 方案 A：所有事件都由 `AgentService` 手动调用 host emit
- 方案 B：host 负责会话创建事件；service 仅在 chat 生命周期节点通知 host

选择：方案 B。

原因：

- `session.created` 本身就是宿主 session lifecycle 的一部分。
- chat.started / completed / failed 仍然依赖 `AgentService` 的 request adaptation 流程，继续由 service 触发更自然。

不选方案 A 的原因：

- 会让 `session.created` 继续悬在 service 层，宿主职责不够完整。

### Decision 3: 对外保留 `AgentService.subscribeEvents()` 形状，避免破坏现有调用方

- 方案 A：直接要求调用方改为依赖 `AgentHost.subscribeEvents()`
- 方案 B：保留 `AgentService.subscribeEvents()`，内部转发到 host

选择：方案 B。

原因：

- 现有 `/events` 路由和测试都依赖 `AgentService.subscribeEvents()`。
- 这次的目标是收拢实现归属，不是扩大 API 迁移范围。

不选方案 A 的原因：

- 会把一次内部架构收拢扩展成不必要的 public API 变更。

## Risks / Trade-offs

- [Risk] 事件归属迁移后，某些测试可能仍假设 event id 是 service-local
  - Mitigation：补共享 host 下的回归测试，显式验证共享事件流语义

- [Risk] host 直接依赖 session summary 结构，进一步耦合 service-api helper
  - Mitigation：只复用已有 summary helper，不在 host 内引入 HTTP surface 逻辑

## Migration Plan

1. 新增 `PRD-63` proposal / design / delta spec。
2. 为 host 增加共享 event stream 类型和订阅/分发能力。
3. 让 `AgentService` 转为复用 host-owned events。
4. 补 focused tests、README、OpenSpec strict。

回滚策略：

- 如果共享事件流引入问题，可回退为 `AgentService` 本地事件总线，同时保留 host/session/daemon 其他基础设施。
