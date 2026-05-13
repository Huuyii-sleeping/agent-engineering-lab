## 1. PRD 与规格

- [x] 1.1 新增 PRD-41，记录架构对照缺口、范围和验收标准
- [x] 1.2 新增 OpenSpec proposal / design / delta spec / tasks

## 2. 入口层实现

- [x] 2.1 新增 CLI dispatcher，支持 help/version、interactive、server、print、mcp-server 模式
- [x] 2.2 新增 headless print entrypoint，复用 `runUserQuery`
- [x] 2.3 新增 stdio MCP server entrypoint，暴露 `agent_chat` 工具
- [x] 2.4 调整 `main.ts` 与 `server.ts` 以复用 dispatcher 和保持直接运行兼容
- [x] 2.5 更新 package scripts

## 3. 验证

- [x] 3.1 新增 focused unit tests 覆盖 dispatcher、headless 和 MCP server
- [x] 3.2 运行 focused tests 与 build
