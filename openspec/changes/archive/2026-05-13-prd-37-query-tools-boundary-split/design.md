## Context

当前 `runtime/query-tools.ts` 的职责包括：

- 遍历模型返回的 tool calls
- 解析 tool arguments
- 生成工具 preview 并记录 `tool_call` event
- 触发 PreToolUse hook，处理 hook 注入消息与阻断
- 执行工具并包裹 execution context
- 分析 tool output，记录 `tool_result` 和 `security_blocked`
- 回填 `role: tool` message
- 触发 PostToolUse hook
- 标记写副作用
- todo 批量完成时自动 `task_update`
- task_create / task_update 对 active task 的同步

QueryToolStage 是主循环连接模型 tool calls、hook runtime、tool service、observability 和任务状态的关键阶段，需要先把内部边界拆清楚。

## Goals / Non-Goals

**Goals:**

- 拆出 query tool hooks 边界。
- 拆出 query tool executor 边界。
- 拆出 query tool task sync 边界。
- 让 `query-tools.ts` 只做 stage orchestration。
- 保持工具执行行为兼容。

**Non-Goals:**

- 不改变 tool call 遍历顺序。
- 不改变 PreToolUse / PostToolUse hook 输入或注入顺序。
- 不改变 hook blocked JSON output。
- 不改变 tool result message shape。
- 不改变 security blocked event。
- 不改变 todo 自动完成或 active task 同步语义。

## Decisions

### Decision 1: 新增 `query-tool-types.ts`

采纳：

- 集中 `QueryToolStageResult`、`RunQueryToolStageOptions`、`QueryToolExecutionInput`、`QueryToolExecutionResult` 等共享类型。

备选方案：

- 类型继续留在 `query-tools.ts`。

不采用原因：

- hooks、executor、task sync 都需要共享 stage options、tool args 和执行结果；集中类型能让 facade 更薄。

### Decision 2: 新增 `query-tool-hooks.ts`

采纳：

- hooks 模块负责 `makeHookBlockedOutput`、PreToolUse 和 PostToolUse hook 调用。
- hooks 模块只处理 hook contract，不执行工具。

备选方案：

- 把 hook 调用留在 executor。

不采用原因：

- hook 语义是独立扩展点；拆出后更容易验证阻断输出和注入消息顺序。

### Decision 3: 新增 `query-tool-executor.ts`

采纳：

- executor 模块负责单个 function tool call 的 preview、span、observability、tool execution、tool result 分析、security event 和 tool message 回填。
- executor 返回分析结果和 parsed args，供 task sync 使用。

备选方案：

- 在 stage orchestration 中继续直接执行工具。

不采用原因：

- 单次工具调用执行是稳定边界，独立后 stage 只关注遍历与后续同步。

### Decision 4: 新增 `query-tool-task-sync.ts`

采纳：

- task sync 模块负责 `maybeAutoCompleteTaskFromTodo` 和 `syncActiveTaskState`。
- 保持它只依赖 runtime state、tool service 和 observability service，不反向依赖 stage facade。

备选方案：

- 把 task sync 放到 query-tool-results。

不采用原因：

- `query-tool-results.ts` 当前是纯 output 分析和副作用标记工具；task sync 需要执行 `task_update`，属于阶段流程，不应塞进纯 helper。

## Risks / Trade-offs

- [Risk] hook 注入消息顺序漂移 -> Mitigation：保留原有 `appendSystemMessages` 调用位置，并用 focused tests 覆盖。
- [Risk] tool message 回填 shape 改变 -> Mitigation：原有 `query-tools.test.ts` 继续覆盖。
- [Risk] todo 自动完成触发条件漂移 -> Mitigation：task sync focused tests 覆盖 todo completed batch。
- [Risk] observability event payload 漂移 -> Mitigation：executor tests 覆盖 `tool_call`、`tool_result`、`security_blocked`。
