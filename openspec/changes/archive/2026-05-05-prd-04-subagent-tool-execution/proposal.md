## Why

PRD-03 仅支持子代理文本推理，不能直接执行工具，导致“子代理说已完成但无真实副作用”与“完成后无自动通知”问题。需要补齐子代理工具执行与完成通知链路，形成可用的委派执行闭环。

## What Changes

- 子代理执行升级为支持工具调用循环（限定白名单工具）。
- 新增子代理完成事件通知队列，主代理在后续轮次自动注入完成摘要。
- 保持现有 `subagent_*` 工具接口兼容，不破坏 PRD-03 使用方式。

## In Scope

- 子代理可调用 `bash/read_file/write_file/edit_file/todo/task_*`。
- 子代理完成或失败时写入通知队列。
- 主循环在后续请求前自动附加通知给模型。

## Out of Scope

- 不实现跨进程持久化通知。
- 不开放子代理递归调用 `subagent_*` 工具。
- 不实现复杂调度与优先级策略。

## Capabilities

### New Capabilities
- `subagent-tool-execution`: 支持子代理工具调用与完成通知注入。

### Modified Capabilities
- `subagent-collaboration`: 从“文本子代理”扩展为“受限工具子代理”。

## Impact

- 影响代码：`src/tools` 工具注册与子代理执行逻辑、`agent-loop` 注入逻辑。
- 影响接口：保持 `subagent_*` 函数签名不变，行为增强。
- 依赖影响：无新增外部依赖。
- 系统影响：子代理执行会产生真实工具副作用（受现有工具安全边界约束）。
