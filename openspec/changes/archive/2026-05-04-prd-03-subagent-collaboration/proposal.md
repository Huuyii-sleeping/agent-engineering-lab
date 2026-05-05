## Why

PRD-02 已提供任务管理能力，但复杂任务仍缺少“并行委派”执行手段，主代理在长链路场景下容易阻塞。当前需要补齐最小子代理协作能力，让主代理可以创建 worker、派发子任务并异步等待结果。

## What Changes

- 新增子代理工具集：`subagent_spawn`、`subagent_send`、`subagent_wait`、`subagent_list`、`subagent_close`。
- 新增 `SubagentManager`，在进程内维护子代理生命周期、状态机与异步执行句柄。
- 子代理执行模型调用时不开放工具，仅返回纯文本结果，避免权限膨胀。
- 主循环工具分发保持兼容，不改变 PRD-02 的 `todo/task` 与文件工具行为。

## In Scope

- 在单进程内支持多个子代理并发执行。
- 支持创建、发送任务、轮询等待、查看状态、关闭子代理。
- 明确错误返回：不存在 agent、重复发送进行中任务、等待超时等。

## Out of Scope

- 不实现跨进程/跨会话持久化子代理状态。
- 不实现子代理工具调用或文件系统直接写操作。
- 不实现真正多模型路由与成本控制策略。

## Capabilities

### New Capabilities
- `subagent-collaboration`: 提供最小子代理生命周期管理与异步委派能力。

### Modified Capabilities
- 无。

## Impact

- 影响代码：`agent_dev/from-scratch-agent/src/tools` 与工具分发层。
- 影响接口：模型新增 5 个可调用工具。
- 依赖影响：无新增第三方依赖，继续使用现有 OpenAI SDK。
- 系统影响：仅进程内内存状态，CLI 交互入口不变。
