## Context

当前 `from-scratch-agent` 已有可用的主循环、多工具调度与文件操作，但仍缺少可持续的任务管理机制：会话内无法稳定展示任务进度，会话外无法跨重启恢复任务状态。PRD-02 目标是引入 `todo`（会话内）与 `task`（会话外）两层能力，且不改变 PRD-01 已验证的主循环契约。

约束：
- todo 仅允许 `pending/in_progress/completed`，最多 20 条，同一时刻最多 1 条 `in_progress`。
- 连续 3 轮未调用 `todo` 时自动注入提醒。
- task 数据落盘到 `.tasks/task_<id>.json`，并在 `completed` 时自动清理其他任务依赖。

## Goals / Non-Goals

**Goals:**
- 新增 `TodoManager` 和 `todo(items)` 工具，支持状态约束与可视化渲染。
- 新增 `TaskManager` 和 `task_create/task_update/task_list/task_get` 工具，支持持久化。
- 保持现有工具调用主循环顺序执行与逐条回填不变。

**Non-Goals:**
- 不实现子代理、技能加载、上下文压缩、后台任务、团队协作。
- 不实现任务看板 UI、数据库持久化或网络同步。

## Decisions

决策 1：会话内 todo 与会话外 task 分离实现。
- 选择：`TodoManager` 保存在内存；`TaskManager` 负责文件持久化。
- 理由：职责清晰，便于后续替换单独存储层。
- 备选：统一到一个持久化模型。
- 不采用原因：会增加简单会话规划场景成本。

决策 2：todo 提醒在主循环层基于轮次计数注入。
- 选择：维护 `roundsWithoutTodo`，阈值 3 时在下一轮请求前附加系统提醒。
- 理由：无需依赖模型记忆，行为确定可测试。
- 备选：在工具层懒触发。
- 不采用原因：工具层无法准确感知“连续轮次未调用”。

决策 3：task 依赖清理由 `task_update(..., status=completed)` 触发。
- 选择：完成任务后扫描 `.tasks/*.json`，移除 `blockedBy` 中对应 id。
- 理由：实现直接，且符合 PRD 要求。
- 备选：仅在 `task_list` 时动态忽略。
- 不采用原因：会导致文件状态与实际逻辑不一致。

## Risks / Trade-offs

- [Risk] `.tasks` 文件数量增加时全量扫描开销上升。  
  -> Mitigation: PRD-02 阶段保持简化实现，后续再做索引优化。
- [Risk] 模型可能长期不调用 `todo`。  
  -> Mitigation: 固定轮次提醒注入，持续纠偏。
- [Risk] 非法 `todo` 输入导致工具报错。  
  -> Mitigation: 严格校验并返回可读错误。

## Migration Plan

1. 新增 `todo` 与 `task` 工具模块，保持已有工具不改语义。
2. 在主循环接入 todo 提醒注入与调用追踪。
3. 执行编译与 AC-02 回归验证，完成后更新任务勾选。

Rollback strategy:
- 回退 `todo/task` 新模块与主循环注入逻辑，恢复 PRD-01 工具集。

## Open Questions

- 是否需要在后续阶段给 `task_update` 增加并发写保护（文件锁）？
- todo 提醒阈值后续是否支持环境变量配置？
