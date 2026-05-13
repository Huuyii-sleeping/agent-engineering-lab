# QueryToolStage 工具执行阶段边界收口

## 这次真正学到的东西
### 1. query-tools 不是简单遍历 tool calls，而是工具执行阶段

`runtime/query-tools.ts` 原来同时负责：
- 遍历模型返回的 tool calls
- 解析 tool arguments
- 生成 preview 并记录 `tool_call`
- 执行 PreToolUse / PostToolUse hooks
- 处理 hook blocked 输出
- 包裹 observability execution context 执行工具
- 分析 tool output，记录 `tool_result` 和 `security_blocked`
- 回填 `role: tool` message
- 标记写副作用
- todo 完成时自动 `task_update`
- task_create / task_update 对 active task 的同步

这说明它本质上是“hook 扩展点 + 单次工具执行 + 工具结果回填 + task/todo 同步 + stage orchestration”的组合。继续全部放在一个文件里，后续只要调整 hook、工具观测或任务联动，就容易误碰工具结果回填契约。

### 2. 这块最自然的边界是 types / hooks / executor / task-sync / orchestration

这一轮拆完之后，内部入口更明确：
- `query-tool-types.ts`
  - 放 `QueryToolStageResult`、`RunQueryToolStageOptions`、`QueryFunctionToolCall`、`QueryToolExecutionResult`
- `query-tool-hooks.ts`
  - 放 hook blocked output
  - 放 PreToolUse / PostToolUse payload 构造与调用
- `query-tool-executor.ts`
  - 放单次 function tool call 的 preview、span、observability、tool execution、output analyze、security event 和 tool message 回填
- `query-tool-task-sync.ts`
  - 放 todo 自动完成 active task
  - 放 task_create / task_update 对 active task 的同步
- `query-tools.ts`
  - 保留 tool calls 遍历、跳过非 function tool call、串联 executor / post hook / task sync

这样后续如果要调整 hook contract，优先改 hooks；如果要调整工具执行观测，优先改 executor；如果要调整 task/todo 联动，优先改 task-sync；如果要调整整个 tool stage 顺序，再改 orchestration。

## 放到本仓库里怎么理解
### 当前已经有的基础

- `core-agent-loop` spec 已经定义工具调用轮次、tool result 回填、写副作用触发自动 delivery
- `hook-extension-points` spec 已经定义 PreToolUse / PostToolUse、阻断和消息注入
- `query-tool-results.ts` 已经沉淀了 output 分析、task id 解析和写副作用标记
- `ToolService` 已经把工具 catalog / execution 收口在工具层

### 当前最明显的差距

- 原 `query-tools.ts` 同时处理 hook、executor、task sync 和 stage loop
- hook blocked output 没有独立模块级测试
- 单次工具调用的 `tool_call` / `tool_result` / `security_blocked` 观测没有独立测试锁定
- task/todo 同步逻辑需要脱离 stage loop 单独测试

### 这轮只解决哪些差距

- 这轮要做的：拆 QueryToolStage 内部边界，补 focused tests，新增沉淀文档
- 这轮不做的：不改工具调用顺序，不改 hook payload，不改 tool result message shape，不改 security event，不改 todo 自动完成或 active task 同步语义

## 这轮采纳了什么
### 采纳

- 新增 `query-tool-types.ts`

集中承接：
- `QueryToolStageResult`
- `RunQueryToolStageOptions`
- `QueryFunctionToolCall`
- `QueryToolExecutionResult`

- 新增 `query-tool-hooks.ts`

承接 hook 边界：
- `makeHookBlockedOutput`
- `runPreToolUseHooks`
- `runPostToolUseHooks`

这里保留原有语义：
- blocked output 仍是 `ok:false/error.code:HOOK_BLOCKED`
- PreToolUse 仍接收 session、trace、span、tool_name、tool_arguments
- PostToolUse 仍接收 tool_output、tool_ok、error_code

- 新增 `query-tool-executor.ts`

承接单次工具执行边界：
- preview
- span id 创建
- `tool_call` event
- PreToolUse hook
- tool execution with execution context
- output analyze
- `tool_result` event
- `security_blocked` event
- `role: tool` message 回填

- 新增 `query-tool-task-sync.ts`

承接 task/todo 同步边界：
- todo 全部 completed 时自动 `task_update`
- task_create 输出 id 后设置 active task
- task_update completed 后清空 active task

- 收窄 `query-tools.ts`

现在 `query-tools.ts` 主要保留：
- 遍历 tool calls
- 跳过非 function tool call
- 调用 executor
- 处理 blocked 后的 continue
- 成功工具标记写副作用
- 执行 PostToolUse hook
- 调用 task/todo sync

- 新增 focused tests

覆盖：
- hook blocked output 和 hook payload
- 单次工具调用执行与 tool message 回填
- `security_blocked` 观测事件
- hook blocked 时不执行底层工具
- task_create / task_update active task 同步
- todo completed 自动 task_update

### 暂不采纳

- 暂不改变 hook 调用时机

PreToolUse、tool result 回填、PostToolUse 的相对顺序保持不变。hook lifecycle 是外部契约，不在边界拆分里调整。

- 暂不迁移 `query-tool-results.ts`

`query-tool-results.ts` 仍然是纯 output 分析和副作用标记工具。task sync 需要执行 `task_update`，所以放到独立 stage 子模块，而不是塞进纯 helper。

- 暂不改变 security event

`security_blocked` 仍在分析到 `SECURITY_` error code 后记录。是否把安全事件归入 security tool 内部，是另一轮跨层设计问题。

- 暂不抽象工具执行队列

当前 tool calls 仍按模型返回顺序同步执行。并发、取消或更复杂队列会改变主循环语义，不属于这轮收口。

## 这轮实际改成了什么
- `query-tool-types.ts` 承接共享类型
- `query-tool-hooks.ts` 承接 hook blocked output 与 Pre/Post hook 调用
- `query-tool-executor.ts` 承接单次工具调用执行、观测、结果分析和 tool message 回填
- `query-tool-task-sync.ts` 承接 todo 自动完成与 active task 同步
- `query-tools.ts` 收成 tool stage orchestration
- 新增 focused unit tests 锁住拆分后最容易漂移的语义

改完之后，后续变更入口更明确：
- 调整 hook payload 或 blocked output，优先改 `query-tool-hooks.ts`
- 调整工具执行观测或 tool message 回填，优先改 `query-tool-executor.ts`
- 调整 todo / task 联动，优先改 `query-tool-task-sync.ts`
- 调整阶段遍历和流程顺序，再改 `query-tools.ts`

## 下一步最自然的动作
1. 继续检查 `runtime/query-finalization.ts`，评估 auto delivery、round counter 和 Stop hook 是否需要边界收口。
2. 如果后续要支持并发工具执行或取消工具执行，单独开 PRD 处理，不要混进当前同步执行语义。
3. 如果要统一 security event 与 security tool 内部观测，先从安全 spec 定义跨层事件归属。
