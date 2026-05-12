## 1. 规格与范围

- [x] 1.1 补齐 PRD-31 与 OpenSpec proposal / design / delta specs / tasks
- [x] 1.2 确认本轮只拆 task-board 内部边界，不改变任务状态机、claim 或 worktree 同步语义

## 2. TaskBoard 边界实现

- [x] 2.1 新增 task types / JSON helper 边界
- [x] 2.2 新增 task store 边界并承接持久化、归一化与依赖清理
- [x] 2.3 新增 task manager 边界并承接 create / get / list / update / scan / claim / worktree sync
- [x] 2.4 更新 `tools/task-board.ts` 为 tool schema 与 public handler facade
- [x] 2.5 更新 `autonomy.ts`、`worktree-manager.ts` 和相关调用方
- [x] 2.6 新增或更新 focused tests

## 3. 文档与验证

- [x] 3.1 新增本轮中文学习沉淀文档
- [x] 3.2 运行 focused unit tests、build、PRD-13 / PRD-18 smoke 与 OpenSpec strict 校验
- [x] 3.3 更新任务状态并收尾 change
