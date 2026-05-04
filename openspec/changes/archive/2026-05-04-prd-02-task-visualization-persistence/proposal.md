## Why

PRD-01 已提供基础文件操作，但代理仍缺少会话内任务可视化与会话外任务持久化能力，复杂任务执行时容易丢失进度与依赖关系。当前需要补齐 `todo + task board` 两层任务管理，为后续子代理与协作能力打基础。

## What Changes

- 新增 `TodoManager` 与 `todo(items)` 工具，支持会话内任务列表渲染与状态约束。
- 新增 `TaskManager` 与 `task_create/task_update/task_list/task_get` 工具，支持任务持久化到 `.tasks/task_<id>.json`。
- 增加 `todo` 提醒注入机制：连续 3 轮未调用 `todo` 时自动提醒模型维护计划。
- 增加任务依赖自动清理：任务标记 `completed` 后，自动移除其他任务对其 `blockedBy` 依赖。
- 保持 PRD-01 主循环与工具回填契约不变，不引入子代理或团队能力。

## Capabilities

### New Capabilities
- `task-visualization-persistence`: 提供会话内 todo 可视化与会话外 task 持久化管理能力。

### Modified Capabilities
- 无。

## Impact

- 影响代码：`agent_dev/from-scratch-agent/src` 的工具层、主循环注入逻辑与任务存储目录管理。
- 影响接口：工具集从 `bash + file-tools` 扩展到 `todo + task_create/task_update/task_list/task_get`。
- 依赖影响：无新增外部依赖，继续使用 Node.js 标准库。
- 系统影响：工作目录新增 `.tasks/` 持久化数据；CLI 交互方式不变。
