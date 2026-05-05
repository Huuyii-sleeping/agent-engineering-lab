## Overview

本变更在现有主代理工具体系上增加“子代理协作层”。核心设计是引入 `SubagentManager`，将子代理建模为受控状态机对象，由主代理通过工具调用驱动其生命周期。

## Goals

- 提供最小可用的委派闭环：创建 -> 派发 -> 等待 -> 收敛 -> 关闭。
- 保证与既有主循环兼容，避免影响 PRD-00/01/02 行为。
- 约束安全边界：子代理仅做文本推理，不可直接调用工具。

## Non-Goals

- 不做持久化恢复。
- 不做工具链透传。
- 不做复杂调度策略（优先级、抢占、限流）。

## Architecture

### 1) SubagentManager

- 维护 `Map<number, SubagentRecord>`。
- 负责 ID 递增分配与状态流转。
- 记录字段：`id/name/status/createdAt/updatedAt/lastInput/lastOutput/lastError`。

### 2) Async execution model

- `subagent_send` 触发一次异步模型调用并立即返回 `accepted`。
- 调用期间状态为 `running`，结束后转为 `completed` 或 `failed`。
- `subagent_wait` 通过轮询 Promise 结果或超时控制返回当前状态。

### 3) Tool boundary

- 子代理调用固定 system prompt，不注入工具定义。
- 返回纯文本，避免间接执行本地命令。

## State Machine

- `idle`：可接收新任务。
- `running`：正在执行，不可重复发送。
- `completed`：可读取结果并再次发送新任务。
- `failed`：可读取错误并再次发送新任务。
- `closed`：终态，不可再操作。

## Error handling

- `AGENT_NOT_FOUND`：id 不存在。
- `AGENT_CLOSED`：对子代理终态执行非法操作。
- `AGENT_BUSY`：运行中重复发送。
- `WAIT_TIMEOUT`：等待超时。
- `INVALID_ARGUMENT`：参数不合法。

## Testing strategy

- 单元层面：状态机转换、参数校验、超时路径。
- 集成层面：工具注册与分发、`subagent_send -> subagent_wait` 正常链路。
- 回归层面：`todo/task/file/bash` 现有行为不回归。
