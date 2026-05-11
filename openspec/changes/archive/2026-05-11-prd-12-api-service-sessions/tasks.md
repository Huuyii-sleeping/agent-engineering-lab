## 1. Artifacts

- [x] 1.1 proposal/design/specs 完成

## 2. Implementation

- [x] 2.1 改造 compact runtime context，支持多 session 并发安全
- [x] 2.2 新增 `AgentService`，封装 session 管理和 `/chat` 调用
- [x] 2.3 新增 HTTP server，提供 `/health`、`/tools`、`/sessions`、`/chat`
- [x] 2.4 为 CLI 调整上下文绑定方式，保持现有行为兼容

## 3. Validation

- [x] 3.1 新增 service 单测，验证 session 隔离
- [x] 3.2 新增 PRD-12 smoke，验证 HTTP 端到端接口
- [x] 3.3 运行 `pnpm --filter agent-cli test`、`pnpm --filter agent-cli build` 与对应 smoke
