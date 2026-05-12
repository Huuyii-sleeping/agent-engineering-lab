## 1. 规格与范围

- [x] 1.1 补齐 PRD-27 与 OpenSpec proposal / design / delta specs / tasks
- [x] 1.2 确认本轮只拆 MCP client 与 registry，不改变 MCP 行为

## 2. MCP client 与 registry 边界实现

- [x] 2.1 新增 MCP client 边界并承接 server lifecycle 与 JSON-RPC request
- [x] 2.2 新增 MCP registry 边界并承接 registration cache、alias、retry 与 run
- [x] 2.3 更新 `tools/mcp.ts` 为 active registry public API facade
- [x] 2.4 更新或新增 focused tests

## 3. 文档与验证

- [x] 3.1 新增本轮中文学习沉淀文档
- [x] 3.2 运行 focused unit tests、build 与 OpenSpec strict 校验
- [x] 3.3 更新任务状态并归档 change
