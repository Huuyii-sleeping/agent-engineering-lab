## Context

当前 `runtime/query-finalization.ts` 的职责包括：

- assistant-only round 的 `roundsWithoutTodo` 自增
- tool-driven round 的 todo 使用后 reset / 未使用后自增
- 写副作用后的 auto delivery 触发
- auto delivery pass/fail summary 构造和 assistant message 回填
- Stop hook payload 构造、调用与 system message 注入
- public finalization API

QueryFinalization 是 QueryEngine 每轮的收尾阶段，和 QueryModel、QueryToolStage 一样属于主链路关键边界。

## Goals / Non-Goals

**Goals:**

- 拆出 round counter 边界。
- 拆出 auto delivery finalizer 边界。
- 拆出 Stop hook runner 边界。
- 让 `query-finalization.ts` 只做 public facade。
- 保持收尾行为兼容。

**Non-Goals:**

- 不改变 Stop hook payload。
- 不改变 auto delivery summary 文案。
- 不改变 roundsWithoutTodo 更新语义。
- 不改变 stopReason 字面值。
- 不改变 `query-engine.ts` 调用方式。

## Decisions

### Decision 1: 新增 `query-finalization-types.ts`

采纳：

- 集中 `FinalizeToolDrivenRoundOptions`、`RunQueryStopStageOptions`、`ToolDrivenStopReason` 等共享类型。

备选方案：

- 类型继续留在 `query-finalization.ts`。

不采用原因：

- delivery、rounds、stop 三个模块都需要共享同一组选项和 stop reason 类型。

### Decision 2: 新增 `query-finalization-rounds.ts`

采纳：

- round 模块负责 assistant-only 与 tool-driven roundsWithoutTodo 更新。

备选方案：

- 继续在 facade 中直接更新 runtime state。

不采用原因：

- round counter 是独立状态语义，拆出后更容易测试 todo reset 行为。

### Decision 3: 新增 `query-finalization-delivery.ts`

采纳：

- delivery finalizer 负责判断是否自动执行 delivery、运行验证、构造 summary 并回填 assistant message。

备选方案：

- 把 delivery finalizer 放到 delivery service。

不采用原因：

- delivery service 负责验证能力，query finalization 负责“何时把自动验证结果回灌到会话历史”。这是 query runtime 收尾职责。

### Decision 4: 新增 `query-finalization-stop.ts`

采纳：

- stop 模块负责 Stop hook payload 与 system message 注入。

备选方案：

- 继续留在 facade 中。

不采用原因：

- Stop hook 是独立扩展点；拆出后更容易保持 hook payload 兼容。

## Risks / Trade-offs

- [Risk] auto delivery summary 文案漂移 -> Mitigation：focused tests 覆盖 pass/fail 文案。
- [Risk] Stop hook payload 漂移 -> Mitigation：focused tests 覆盖 payload。
- [Risk] roundsWithoutTodo 更新漂移 -> Mitigation：rounds tests 覆盖 assistant-only、usedTodo true/false。
