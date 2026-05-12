## 1. 规格与范围

- [x] 1.1 补齐 PRD-29 与 OpenSpec proposal / design / delta specs / tasks
- [x] 1.2 确认本轮只拆 Team 内部边界，不改变消息或协议语义

## 2. Team 边界实现

- [x] 2.1 新增 team types / JSON 工具边界
- [x] 2.2 新增 team store 边界并承接 teammates / requests / inbox 持久化
- [x] 2.3 新增 team protocol 边界并承接 request id、状态流转与 message 构造
- [x] 2.4 新增 team manager 边界并承接 init、notifications 与流程编排
- [x] 2.5 更新 `tools/team.ts` 为 tool schema 与 public handler facade
- [x] 2.6 更新或新增 focused tests

## 3. 文档与验证

- [x] 3.1 新增本轮中文学习沉淀文档
- [x] 3.2 运行 focused unit tests、build 与 OpenSpec strict 校验
- [x] 3.3 更新任务状态并归档 change
