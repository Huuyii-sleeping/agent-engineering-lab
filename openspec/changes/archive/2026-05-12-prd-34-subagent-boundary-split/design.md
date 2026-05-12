## Context

当前 `tools/subagent.ts` 同时负责：
- `subagent_*` tool schema
- in-memory subagent record map / running jobs / notification queue
- spawn / list / send / wait / close 生命周期
- 模型策略选择、预算拒绝、fallback 与 finalize usage
- tool-calling 循环与 base tool 执行
- 完成/失败通知与 observability 回流
- public exports

这说明 subagent 不是一个简单的工具声明文件，而是“生命周期状态面 + 模型执行面 + 通知回流”的组合。要继续稳定扩展子代理能力，就需要先把内部边界收清。

## Goals / Non-Goals

**Goals:**

- 拆出 subagent shared types / JSON helper
- 拆出 subagent executor 边界
- 拆出 subagent manager 边界
- 让 `tools/subagent.ts` 退成 facade
- 保持子代理行为兼容

**Non-Goals:**

- 不改变 `subagent_*` tool schema 或 JSON 输出 shape
- 不改变仅允许 base tools、禁止递归 subagent 工具的约束
- 不改变通知注入语义或 observability 事件阶段
- 不引入持久化、取消执行或并发多任务语义

## Decisions

### Decision 1: 新增 `subagent-types.ts`

采纳：
- 集中 `SubagentStatus`、`SubagentRecord`、`SubagentNotification`、执行结果类型和 `ok/err/snapshot` helper

备选方案：
- 继续把类型和 helper 留在 `subagent.ts`

不采用原因：

- manager、executor 和 tests 都需要共享这些 shape，继续留在 facade 中会延续单文件聚合。

### Decision 2: 新增 `subagent-executor.ts`

采纳：
- executor 负责懒加载 OpenAI client、模型选择、fallback、tool loop 和 usage finalize

备选方案：
- 让 manager 继续直接持有执行循环

不采用原因：

- 生命周期状态面和模型执行面变化频率不同；独立 executor 后，后续调整模型策略、fallback 或 tool loop 不会顺手污染状态编排。

### Decision 3: 新增 `subagent-manager.ts`

采纳：
- manager 负责 record map、running jobs、notification queue、spawn/list/send/wait/close 与 observability

备选方案：
- 再进一步拆 notification store

不采用原因：

- 本轮先收口 manager / executor / facade 三层，避免过度细分；通知目前仍然和生命周期状态强绑定。

## Risks / Trade-offs

- [Risk] manager 与 executor 的职责切开后，完成/失败状态回写顺序出错
  - Mitigation：用 deferred executor focused tests 覆盖 running、timeout、completed/failed 与 notification drain。
- [Risk] fallback 或 budget deny 语义漂移
  - Mitigation：补 executor focused tests，覆盖无工具完成、tool loop、budget deny。
- [Risk] facade 收窄后外部导出回归
  - Mitigation：保持现有 `runSubagent*`、`drainSubagentNotifications` 与 `SUBAGENT_TOOLS` 导出不变。
