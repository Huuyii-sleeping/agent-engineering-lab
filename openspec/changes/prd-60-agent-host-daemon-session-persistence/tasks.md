## 1. Host 与持久化底座

- [x] 1.1 新增 `AgentHost` 抽象，统一承载 runtime services、query engine、session registry 与事件流。
- [x] 1.2 新增 session store，支持 session 索引读取、单 session 持久化与恢复。
- [x] 1.3 为 host 接入 session store，使启动时可加载已有 session，运行时可保存更新。

## 2. Daemon 与入口装配

- [x] 2.1 新增 `daemon` 入口并接入长期 `AgentHost` 生命周期。
- [x] 2.2 调整 `AgentService` 使其依赖共享 host，而不是自行持有分散 session 状态。
- [x] 2.3 调整 HTTP / MCP / TUI 装配路径，优先复用共享 host。

## 3. 验证与回归

- [x] 3.1 新增 unit tests，覆盖 host 创建、session 恢复和持久化更新行为。
- [x] 3.2 新增或更新 service API / entrypoint tests，覆盖 daemon 模式与共享 host 装配行为。
- [x] 3.3 运行聚焦测试并确认现有 session / chat 契约无回归。
