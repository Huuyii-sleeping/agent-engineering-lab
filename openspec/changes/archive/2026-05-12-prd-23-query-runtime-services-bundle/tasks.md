## 1. 规格与范围

- [x] 1.1 补齐 PRD-23 与 OpenSpec proposal / design / delta specs / tasks
- [x] 1.2 确认本轮只收 Query runtime services 依赖形态，不迁移 `ToolService`

## 2. RuntimeServices 实现

- [x] 2.1 新增 `RuntimeServices` / override 类型与默认创建函数
- [x] 2.2 更新 `createAgentAppRuntime` 使用 runtime services 依赖包，同时保留单项 override
- [x] 2.3 更新 `QueryEngine` 通过依赖包访问 service

## 3. 文档与验证

- [x] 3.1 新增本轮中文学习沉淀文档
- [x] 3.2 运行 focused unit tests、build 与 OpenSpec strict 校验
- [x] 3.3 更新任务状态并归档 change
