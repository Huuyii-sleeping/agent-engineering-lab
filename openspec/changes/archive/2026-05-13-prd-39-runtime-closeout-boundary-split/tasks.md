## 1. 规格与范围

- [x] 1.1 补齐 PRD-39 与 OpenSpec proposal / design / delta specs / tasks
- [x] 1.2 确认本轮合并收口只做边界拆分，不改变 query loop、notification、hook、session 或 release gate 语义

## 2. Runtime 剩余边界实现

- [x] 2.1 新增 QueryEngine round state / loop metadata 边界
- [x] 2.2 新增 QueryNotifications formatter / recorder 边界
- [x] 2.3 新增 QueryRuntime user prompt submit 边界
- [x] 2.4 新增 AgentService session helper 边界
- [x] 2.5 更新 orchestration / adapter 文件复用新边界
- [x] 2.6 新增或更新 focused tests

## 3. 文档与验证

- [x] 3.1 新增本轮中文学习沉淀文档
- [x] 3.2 更新当前对话交接文档
- [x] 3.3 运行 focused unit tests、build、OpenSpec strict 与 diff check
- [x] 3.4 更新任务状态并归档 change
