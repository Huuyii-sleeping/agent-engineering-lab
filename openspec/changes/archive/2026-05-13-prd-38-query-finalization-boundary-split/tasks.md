## 1. 规格与范围

- [x] 1.1 补齐 PRD-38 与 OpenSpec proposal / design / delta specs / tasks
- [x] 1.2 确认本轮只拆 QueryFinalization 内部边界，不改变 stopReason、auto delivery、round counter 或 Stop hook

## 2. QueryFinalization 边界实现

- [x] 2.1 新增 query finalization types 边界
- [x] 2.2 新增 query finalization round counter 边界
- [x] 2.3 新增 query finalization delivery finalizer 边界
- [x] 2.4 新增 query finalization stop hook runner 边界
- [x] 2.5 更新 `query-finalization.ts` 为 public facade
- [x] 2.6 更新或新增 focused tests

## 3. 文档与验证

- [x] 3.1 新增本轮中文学习沉淀文档
- [x] 3.2 运行 focused unit tests、build 与 OpenSpec strict 校验
- [x] 3.3 更新任务状态并归档 change
