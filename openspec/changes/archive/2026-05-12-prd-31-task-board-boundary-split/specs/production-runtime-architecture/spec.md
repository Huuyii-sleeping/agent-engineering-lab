## ADDED Requirements

### Requirement: Task board internals MUST separate store manager and tool facade boundaries
任务面板工具内部 MUST 区分任务持久化 store、任务流程 manager 与 tool facade，使任务状态机、claim 流程、worktree 同步和对外工具契约可以独立演进。

#### Scenario: 读取 task board public facade
- **WHEN** 维护者阅读 `tools/task-board.ts`
- **THEN** 该文件主要表达 task tool schema 与 public handlers，而不是直接承载任务读写、状态迁移、claim 或 worktree sync 的全部细节

#### Scenario: 调整任务持久化或依赖清理
- **WHEN** 系统调整 `.tasks/task_*.json` 的兼容读取、保存或 completed 后的 blockedBy 清理逻辑
- **THEN** 维护者主要修改 task store 边界，而不是修改 tool facade 或 autonomy / worktree 调用方

#### Scenario: 调整任务状态机或 claim 流程
- **WHEN** 系统调整 task status transition、unclaimed scan、claim 或 worktree state sync
- **THEN** 维护者主要修改 task manager 边界，而不是修改 task store 或 tool schema
