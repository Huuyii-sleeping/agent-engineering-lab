# QueryFinalization 收尾阶段边界收口

## 这次真正学到的东西
### 1. QueryFinalization 是主循环的收尾阶段，不只是几行状态更新

`runtime/query-finalization.ts` 原来同时负责：
- assistant-only round 的 `roundsWithoutTodo` 自增
- tool-driven round 的 todo 使用后 reset / 未使用后自增
- 写副作用后的 auto delivery 触发
- auto delivery pass/fail summary 构造和 assistant message 回填
- Stop hook payload 构造、调用与 system message 注入
- 对 `query-engine.ts` 暴露 public finalization API

这些逻辑虽然文件规模不大，但都处在 QueryEngine 每轮执行的末端。这里一旦改错，影响的是模型输出、工具执行、delivery 校验和 hook 扩展点之间的最终交接，所以它需要独立边界，而不是继续把所有收尾细节放在 facade 里。

### 2. 这块最自然的边界是 types / rounds / delivery / stop / facade

这一轮拆完之后，内部入口更明确：
- `query-finalization-types.ts`
  - 放 `ToolDrivenStopReason`
  - 放 `FinalizeToolDrivenRoundOptions`
  - 放 `RunQueryStopStageOptions`
- `query-finalization-rounds.ts`
  - 放 assistant-only round counter 更新
  - 放 tool-driven round counter reset / increment
- `query-finalization-delivery.ts`
  - 放 auto delivery 触发条件
  - 放 delivery validation 调用
  - 放 pass/fail summary 构造和 assistant message 回填
- `query-finalization-stop.ts`
  - 放 Stop hook payload
  - 放 hook messages 到 system messages 的注入
- `query-finalization.ts`
  - 只保留 `finalizeAssistantOnlyRound`
  - 只保留 `finalizeToolDrivenRound`
  - 只保留 `runQueryStopStage`

这样后续如果要调整轮次计数，优先改 rounds；如果要调整自动交付验证摘要或触发条件，优先改 delivery；如果要调整 Stop hook contract，优先改 stop；如果要调整外部 API，再改 facade。

## 放到本仓库里怎么理解
### 当前已经有的基础

- `core-agent-loop` spec 已经定义 assistant-only / tool-driven round 的 stop reason 和 round counter 语义
- `delivery-quality-validation` spec 已经定义写副作用后的自动交付验证与报告结构
- `hook-extension-points` spec 已经定义 Stop hook payload 与消息注入
- PRD-36 已经把 QueryModel 拆成 request / fallback / recovery
- PRD-37 已经把 QueryToolStage 拆成 hooks / executor / task-sync

QueryFinalization 正好接在这两轮之后，负责把模型输出、工具执行和交付验证的结果收成一个稳定的 query round outcome。

### 当前最明显的差距

- 原 `query-finalization.ts` 同时承载 round counter、delivery finalizer 和 Stop hook
- auto delivery summary 文案没有独立模块级测试锁住
- Stop hook payload 没有独立模块级测试锁住
- round counter 的 usedTodo reset / increment 语义需要脱离 facade 单独测试

### 这轮只解决哪些差距

- 这轮要做的：拆 QueryFinalization 内部边界，补 focused tests，新增沉淀文档
- 这轮不做的：不改 stopReason 字面值，不改 auto delivery summary 文案，不改 `roundsWithoutTodo` 更新语义，不改 Stop hook payload，不改 `query-engine.ts` 调用方式

## 这轮采纳了什么
### 采纳

- 新增 `query-finalization-types.ts`

集中承接：
- `ToolDrivenStopReason`
- `FinalizeToolDrivenRoundOptions`
- `RunQueryStopStageOptions`

- 新增 `query-finalization-rounds.ts`

承接 round counter 边界：
- assistant-only 继续返回 `assistant_response` 并让 `roundsWithoutTodo += 1`
- tool-driven 且 `usedTodo=true` 继续把 `roundsWithoutTodo` 重置为 `0`
- tool-driven 且 `usedTodo=false` 继续让 `roundsWithoutTodo += 1`

- 新增 `query-finalization-delivery.ts`

承接 auto delivery finalizer：
- 只有 `deliveryAutoRunEnabled && runtimeState.wroteWorkspaceFiles` 时运行自动交付验证
- validation 继续使用 `mode: "auto"`、`changedPaths: [...runtimeState.touchedPaths]` 和当前 `traceId`
- pass summary 继续是 `Auto delivery validation passed (${passed}/${total} stages passed).`
- fail summary 继续是 `Auto delivery validation failed at ${stage}: ${code}. ${suggestion}` 并 trim
- 自动验证后继续回填 assistant message

- 新增 `query-finalization-stop.ts`

承接 Stop hook runner：
- hook 名称继续是 `Stop`
- payload 继续包含 `round`、`outcome`、`tool_call_count`
- session / trace 字段继续是 `session_id`、`trace_id`
- hook 返回消息继续通过 `appendSystemMessages` 作为 system messages 注入

- 收窄 `query-finalization.ts`

现在 facade 主要表达 public API：
- `finalizeAssistantOnlyRound`
- `finalizeToolDrivenRound`
- `runQueryStopStage`

- 新增 focused tests

覆盖：
- assistant-only round counter 自增
- tool-driven usedTodo reset / increment
- auto delivery pass/fail summary 文案
- auto delivery 触发条件和 changedPaths / traceId
- Stop hook payload 和 system message 注入

### 暂不采纳

- 暂不改变 stopReason

`assistant_response`、`tool_calls_processed`、`auto_delivery_passed`、`auto_delivery_failed` 都是 query round 的外部 outcome 契约。边界拆分不应该顺手调整这些字面值。

- 暂不改变 auto delivery summary 文案

这些 summary 会进入会话历史。文案漂移会影响用户可见输出，也可能影响后续模型上下文，所以只迁移生成位置，不改字符串。

- 暂不改变 Stop hook payload

Stop hook 属于扩展点契约。payload 字段名和语义保持不变，避免已有 hook 配置失效。

- 暂不把 delivery finalizer 下沉到 delivery service

delivery service 负责“如何验证”，QueryFinalization 负责“何时在 query round 收尾时验证，并如何把结果回灌到消息历史”。这两个职责需要分开。

## 这轮实际改成了什么

- `query-finalization-types.ts` 承接共享类型
- `query-finalization-rounds.ts` 承接 round counter 更新
- `query-finalization-delivery.ts` 承接 auto delivery 触发、summary 和 assistant message 回填
- `query-finalization-stop.ts` 承接 Stop hook 调用与 system message 注入
- `query-finalization.ts` 收成 public facade
- 新增 focused unit tests 锁住拆分后最容易漂移的收尾语义

改完之后，后续变更入口更明确：
- 调整 `roundsWithoutTodo` 语义，优先改 `query-finalization-rounds.ts`
- 调整自动交付验证触发或摘要，优先改 `query-finalization-delivery.ts`
- 调整 Stop hook payload 或注入方式，优先改 `query-finalization-stop.ts`
- 调整对外调用入口，再改 `query-finalization.ts`

## 下一步最自然的动作
1. 继续检查 `runtime/query-engine.ts` 本身的 orchestration 是否还需要拆出 stage coordinator。
2. 如果后续要统一 stop reason 类型在整个 runtime 的传播，单独开 PRD 处理，不要混进 QueryFinalization 边界拆分。
3. 如果要改变自动交付验证失败后的恢复策略，先从 delivery spec 定义用户可见行为。
