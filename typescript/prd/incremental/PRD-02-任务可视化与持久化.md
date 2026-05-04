# PRD-02 任务可视化与持久化

## 目标

让 Agent 具备“会话内进度管理 + 会话外任务持久化”能力。

## 范围（In Scope）

- `TodoManager` + `todo(items)`（对应 S03）。
- `TaskManager` + `task_create/task_update/task_list/task_get`（对应 S07）。

## 非目标（Out of Scope）

- 子代理、技能加载、上下文压缩、后台任务、团队协作。

## 功能要求

- Todo 最多 20 条；状态仅 `pending/in_progress/completed`。
- 同时最多 1 条 `in_progress`。
- 连续 3 轮未调用 `todo` 时注入提醒。
- Task 持久化到 `.tasks/task_<id>.json`。
- `completed` 后自动清理其他任务对它的 `blockedBy` 依赖。

## 验收标准（AC）

- AC-02-1：`todo` 可渲染 `[ ] [>] [x]` 状态且约束生效。
- AC-02-2：任务数据重启后可恢复。
- AC-02-3：任务状态变更后依赖关系同步正确。

## 实施顺序

1. 实现 `TodoManager` 与提醒注入。
2. 实现 `TaskManager` 持久化。
3. 打通任务工具并完成重启恢复验证。

