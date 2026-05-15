## 1. PRD 与规格

- [x] 1.1 新增 `PRD-65` 增量文档、proposal / design / delta spec

## 2. interactive CLI daemon reuse

- [x] 2.1 为 interactive CLI 抽取 daemon-aware service/session adapter，并复用共享 daemon client resolver
- [x] 2.2 让默认 `agent-cli` 优先 attach 到运行中的 daemon，并在不可复用时回退 embedded CLI
- [x] 2.3 调整 CLI 命令上下文、session 状态与启动提示，保证 `/new`、`/use`、聊天主链路和关键本地命令在 attach 模式下可用

## 3. 验证与文档

- [x] 3.1 补 focused tests，并同步 README / 架构沉淀
- [x] 3.2 运行 build、OpenSpec strict 和差异检查
