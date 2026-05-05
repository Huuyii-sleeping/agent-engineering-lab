# Workspace Agent Execution Rules

## 目标

统一当前工作区的 Agent 执行规范，确保任务推进、测试、提交、归档行为一致且可追溯。

## 任务执行流程（默认）

1. 先读对应 `agent_dev/prd/incremental/PRD-XX-*.md`。
2. 按 OpenSpec 流程执行：`new change -> artifacts -> implement -> validate -> archive`。
3. 每个 PRD 完成后先验收，再提交。

## 优先级策略

- P0：优先完善现有功能（当前为 `PRD-13`）。
- P1+：再做新增功能（`PRD-07` 及以后）。

## 提交前清理规范（必须执行）

提交前必须删除运行时与测试产物，不纳入 commit：

- `agent_dev/from-scratch-agent/.tasks/`
- `agent_dev/from-scratch-agent/.team/`
- `agent_dev/from-scratch-agent/.worktrees/`
- `agent_dev/from-scratch-agent/.transcripts/`
- `agent_dev/from-scratch-agent/tmp/`

## 提交内容规范

- 只提交：
  - 源代码变更（`src/` 等）
  - 必要文档变更（`prd/`, `openspec/`）
- 不提交：
  - 临时脚本
  - 本地快照
  - 持久化运行数据

## 验证规范

每次实现至少执行：

1. `npm run build`
2. 对应 PRD 的 smoke/回归测试
3. `openspec status --change "<name>" --json`
4. `openspec validate "<name>" --type change --json`

## 失败处理规范

- 任何失败先给出可读错误原因，再给修复动作。
- 若遇沙箱执行异常，可使用提权命令重试。
- 不使用破坏性 Git 命令（如 `reset --hard`）。

## 归档规范

变更完成后必须：

1. `openspec archive "<change>" -y`
2. 确认 specs 已同步
3. 再执行最终提交
