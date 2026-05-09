# PRD-18 Worktree 执行车道与收尾模型增强

## 目标

把当前 worktree 能力从“会建目录和跑命令”，增强为“任务执行车道 + 显式收尾模型 + 可恢复状态”。

## 范围（In Scope）

- 任务侧新增：
  - `worktree_state`
  - `last_worktree`
  - `closeout`
- worktree 侧新增：
  - `last_entered_at`
  - `last_command_at`
  - `last_command_preview`
  - `closeout`
- `worktree_enter(...)`
- 统一 `worktree_closeout(...)`
- 删除前脏改动检查与更明确的保留/回收语义

## 非目标（Out of Scope）

- 企业级 git 运维细节大全。
- 完整 code review 流转平台。

## 功能要求

- task 与 worktree 必须显式绑定，分别回答“做什么”和“在哪做”。
- 任务状态与车道状态必须分离，不得混用一个字段。
- `worktree_enter` 和 `worktree_run` 语义拆分，保留进入时间与最近命令摘要。
- `keep` / `remove` 应统一建模为 closeout 决策的两个分支。
- 删除前至少检查是否有脏改动，避免误删未提交工作。

## 验收标准（AC）

- AC-18-1：任务记录可明确显示当前车道、最近车道和车道状态。
- AC-18-2：worktree 记录可显示最近进入时间和最近命令摘要。
- AC-18-3：closeout 后任务记录、车道记录和事件日志保持一致。
- AC-18-4：存在脏改动时，回收流程会阻止或显式要求确认。

## 实施顺序

1. 先扩展 task/worktree 数据结构。
2. 再实现 `enter` 与 `closeout` 主流程。
3. 最后补脏改动检查、恢复语义与验证脚本。
