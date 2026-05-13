## 1. 规格与范围

- [x] 1.1 补齐 PRD-37 与 OpenSpec proposal / design / delta specs / tasks
- [x] 1.2 确认本轮只拆 QueryToolStage 内部边界，不改变 tool call order、hook、tool result、security event 或 task/todo sync

## 2. QueryToolStage 边界实现

- [x] 2.1 新增 query tool types / shared helper 边界
- [x] 2.2 新增 query tool hooks 边界并承接 hook blocked output 与 Pre/Post hook 调用
- [x] 2.3 新增 query tool executor 边界并承接单次工具调用执行、观测、结果分析和 tool message 回填
- [x] 2.4 新增 query tool task sync 边界并承接 todo 自动完成与 active task 同步
- [x] 2.5 更新 `query-tools.ts` 为 stage orchestration facade
- [x] 2.6 更新或新增 focused tests

## 3. 文档与验证

- [x] 3.1 新增本轮中文学习沉淀文档
- [x] 3.2 运行 focused unit tests、build 与 OpenSpec strict 校验
- [x] 3.3 更新任务状态并归档 change
