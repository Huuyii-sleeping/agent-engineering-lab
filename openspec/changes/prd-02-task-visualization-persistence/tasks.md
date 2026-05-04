## 1. Todo 能力实现

- [x] 1.1 新增 `TodoManager`，实现 `todo(items)` 的输入校验（状态枚举、最多 20 条、最多 1 条 in_progress）。
- [x] 1.2 实现 todo 渲染输出，使用 `[ ]/[>]/[x]` 与完成计数格式。
- [x] 1.3 在主循环接入“连续 3 轮未调用 todo”提醒注入，并在调用 todo 后重置计数。

## 2. Task 持久化能力实现

- [x] 2.1 新增 `TaskManager`，实现 `.tasks/task_<id>.json` 的创建与读取。
- [x] 2.2 实现 `task_update` 状态与依赖更新（含 `addBlockedBy/removeBlockedBy`）。
- [x] 2.3 实现任务完成后自动清理其他任务 `blockedBy` 依赖。
- [x] 2.4 实现 `task_list/task_get` 输出与空列表处理。

## 3. 工具接线与回归验证

- [x] 3.1 将 `todo/task_create/task_update/task_list/task_get` 注册到工具集合与分发映射。
- [x] 3.2 验证 AC-02-1：todo 状态渲染与约束生效。
- [x] 3.3 验证 AC-02-2：任务在重启后可恢复。
- [x] 3.4 验证 AC-02-3：任务完成后依赖同步清理正确，且 PRD-01 能力无回归。
