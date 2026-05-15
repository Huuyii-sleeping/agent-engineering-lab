## ADDED Requirements

### Requirement: Service API and HTTP surface internals MUST live under a dedicated module subtree
会话管理与 HTTP service surface MUST 具备独立目录边界，避免这类对外 API 相关实现继续散落在应用根层源码目录，或与 runtime `services/` 依赖包混在一起。

#### Scenario: Maintainer reads the source root
- **WHEN** 维护者阅读 `apps/agent-cli/src/`
- **THEN** 应能明确区分 runtime `services/` 依赖包与对外 service API / HTTP surface
- **AND** `AgentService`、session helpers 和 server launcher 位于专门的 `service-api/` 子目录，而不是持续平铺在 `src/` 根层

#### Scenario: Entry surfaces reuse the dedicated service API subtree
- **WHEN** CLI dispatcher、TUI、MCP server 或 HTTP 启动器需要复用会话管理与对外 service API 能力
- **THEN** 它们通过 `service-api/` 子目录中的稳定模块引用 `AgentService`、session helpers 和 server launcher
- **AND** 不要求调用方继续依赖散落在 `src/` 根层的 `agent-service*` 或 `server.ts` 文件路径
