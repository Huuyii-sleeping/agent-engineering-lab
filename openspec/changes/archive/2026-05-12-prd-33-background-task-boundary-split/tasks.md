## 1. 规格与范围

- [x] 1.1 补齐 PRD-33 与 OpenSpec proposal / design / delta specs / tasks
- [x] 1.2 确认本轮只拆 background-task 内部边界，不改变异步执行、通知或 observability 语义

## 2. BackgroundTask 边界实现

- [x] 2.1 新增 background task types / output helper 边界
- [x] 2.2 新增 background task runner 边界并承接子进程启动
- [x] 2.3 新增 background task manager 边界并承接任务状态、通知队列与 observability 编排
- [x] 2.4 更新 `tools/background-task.ts` 为 tool schema、默认 manager 与兼容导出 facade
- [x] 2.5 新增或更新 focused tests

## 3. 文档与验证

- [x] 3.1 新增本轮中文学习沉淀文档
- [x] 3.2 运行 focused unit tests、build 与 OpenSpec strict 校验
- [x] 3.3 更新任务状态并收尾 change
