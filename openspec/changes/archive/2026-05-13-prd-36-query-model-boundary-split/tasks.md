## 1. 规格与范围

- [x] 1.1 补齐 PRD-36 与 OpenSpec proposal / design / delta specs / tasks
- [x] 1.2 确认本轮只拆 QueryModel 内部边界，不改变 request messages、model policy、fallback、recovery 或 stopReason

## 2. QueryModel 边界实现

- [x] 2.1 新增 query model types / shared helper 边界
- [x] 2.2 新增 query model request 边界并承接 request messages、OpenAI request 与 response 归一化
- [x] 2.3 新增 query model fallback 边界并承接 fallback selection、fallback request 与 usage finalize
- [x] 2.4 新增 query model recovery 边界并承接 recovery failure、preflight compact 与 recovery observability helper
- [x] 2.5 更新 `query-model.ts` 为 public orchestration facade
- [x] 2.6 更新或新增 focused tests

## 3. 文档与验证

- [x] 3.1 新增本轮中文学习沉淀文档
- [x] 3.2 运行 focused unit tests、build 与 OpenSpec strict 校验
- [x] 3.3 更新任务状态并归档 change
