## 1. 规格与范围

- [x] 1.1 补齐 PRD-30 与 OpenSpec proposal / design / delta specs / tasks
- [x] 1.2 确认本轮只拆 Worktree 内部边界，不改变 closeout、dirty guard 或 task sync 行为

## 2. Worktree 边界实现

- [x] 2.1 新增 worktree types / JSON 工具边界
- [x] 2.2 新增 worktree store 边界并承接 index / events 持久化与记录归一化
- [x] 2.3 新增 worktree runner 边界并承接 command exec、git repo 与 dirty files 检测
- [x] 2.4 新增 worktree manager 边界并承接 create、enter、run、closeout 与 task sync 编排
- [x] 2.5 更新 `tools/worktree.ts` 为 tool schema 与 public handler facade
- [x] 2.6 更新或新增 focused tests

## 3. 文档与验证

- [x] 3.1 新增本轮中文学习沉淀文档
- [x] 3.2 运行 focused unit tests、build、PRD-18 smoke 与 OpenSpec strict 校验
- [x] 3.3 更新任务状态并归档 change
