## 1. PRD 与规格

- [x] 1.1 新增 PRD-42，明确 TUI、remote bridge、MCP 管理面的实现范围
- [x] 1.2 新增 OpenSpec proposal / design / delta spec / tasks

## 2. Service 与 Bridge

- [x] 2.1 扩展 AgentService session detail、bridge manifest 与 event subscription
- [x] 2.2 扩展 HTTP service endpoint：`/bridge`、`/sessions/:id`、`/events`

## 3. Entry Surfaces

- [x] 3.1 新增 terminal TUI 控制台入口和 CLI dispatcher 模式
- [x] 3.2 扩展 inbound MCP server session/tool 管理工具
- [x] 3.3 更新 package scripts

## 4. 验证

- [x] 4.1 新增 focused unit tests 覆盖 bridge、TUI renderer/commands、MCP 管理工具
- [x] 4.2 运行 focused tests、build、OpenSpec strict
