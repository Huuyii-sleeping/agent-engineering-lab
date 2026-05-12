## 1. 规格与范围

- [x] 1.1 补齐 PRD-28 与 OpenSpec proposal / design / delta specs / tasks
- [x] 1.2 确认本轮只拆 Security 内部边界，不改变审批或 gate 行为

## 2. Security 边界实现

- [x] 2.1 新增 security types / JSON 工具边界
- [x] 2.2 新增 security policy 边界并承接默认规则、merge、match、evaluate
- [x] 2.3 新增 approval store 边界并承接 approval load/save/normalize
- [x] 2.4 新增 security manager 边界并承接 init、audit、approval workflow 与 gate
- [x] 2.5 更新 `tools/security.ts` 为 tool schema 与 public handler facade
- [x] 2.6 更新或新增 focused tests

## 3. 文档与验证

- [x] 3.1 新增本轮中文学习沉淀文档
- [x] 3.2 运行 focused unit tests、build 与 OpenSpec strict 校验
- [x] 3.3 更新任务状态并归档 change
