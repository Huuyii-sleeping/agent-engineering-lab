## 1. 规格与范围

- [x] 1.1 补齐 PRD-32 与 OpenSpec proposal / design / delta specs / tasks
- [x] 1.2 确认本轮只拆 scheduler 内部边界，不改变 cron 语义、持久化或调度行为

## 2. Scheduler 边界实现

- [x] 2.1 新增 scheduler types / timestamp helper 边界
- [x] 2.2 新增 scheduler cron 边界并承接 parse / validate / match
- [x] 2.3 新增 scheduler store 边界并承接 records / notifications 持久化与兼容读取
- [x] 2.4 新增 scheduler manager 边界并承接 create / list / remove / tick / drain / peek
- [x] 2.5 更新 `tools/scheduler.ts` 为 tool schema、默认 manager 与兼容导出 facade
- [x] 2.6 新增或更新 focused tests

## 3. 文档与验证

- [x] 3.1 新增本轮中文学习沉淀文档
- [x] 3.2 运行 focused unit tests、build、PRD-17 scheduler smoke 与 OpenSpec strict 校验
- [x] 3.3 更新任务状态并收尾 change
