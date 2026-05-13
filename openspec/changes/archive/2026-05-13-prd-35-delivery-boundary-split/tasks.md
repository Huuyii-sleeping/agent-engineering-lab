## 1. 规格与范围

- [x] 1.1 补齐 PRD-35 与 OpenSpec proposal / design / delta specs / tasks
- [x] 1.2 确认本轮只拆 Delivery 内部边界，不改变 stage plan、failure classify、retry 或 report shape

## 2. Delivery 边界实现

- [x] 2.1 新增 delivery types / JSON 工具边界
- [x] 2.2 新增 delivery plan 边界并承接 package script 探测与 stage plan 构建
- [x] 2.3 新增 delivery runner 边界并承接 command exec、retry、failure classify 与 observability
- [x] 2.4 新增 delivery report store 边界并承接 report 读写
- [x] 2.5 更新 `delivery.ts` 为 public validation / tool facade
- [x] 2.6 更新或新增 focused tests

## 3. 文档与验证

- [x] 3.1 新增本轮中文学习沉淀文档
- [x] 3.2 运行 focused unit tests、build、delivery smoke 与 OpenSpec strict 校验
- [x] 3.3 更新任务状态并归档 change
