## Why

`apps/agent-cli/src/` 在收拢 `cli/` 和 `delivery/` 之后，剩下最明显仍然平铺在根层的一组文件是 `agent-service.ts`、`agent-service-sessions.ts` 和 `server.ts`。这三者共同承载会话管理、HTTP API surface 和 server 启动逻辑，已经形成稳定子系统，却仍和应用级根文件混在一起。

继续把这组实现留在根层，会让维护者难以区分：

- 运行时共享模块
- 入口/启动文件
- 对外 session / HTTP service surface

因此需要为这组服务 API 相关实现建立独立目录边界。

## What Changes

- 新增 `PRD-59`，收拢 `agent-cli` 中 service API / HTTP surface 相关目录结构。
- 建立 `src/service-api/` 子目录，承接 `AgentService`、session helpers 和 server launcher。
- 迁移现有 `agent-service.ts`、`agent-service-sessions.ts`、`server.ts` 到新子目录。
- 更新 CLI dispatcher、TUI、MCP server、测试和文档中的 import 路径，保持行为不变。
- 同步 README、学习沉淀和主规格中的目录边界说明。

## In Scope

- `src/service-api/` 目录建立与相关文件迁移
- import 路径更新
- focused tests、build、OpenSpec strict
- 文档和沉淀同步

## Out of Scope

- HTTP API 行为调整
- session record 结构修改
- query runtime / services / tools 的功能变更
- 更大范围的测试目录重组

## Capabilities

### Modified Capabilities

- `production-runtime-architecture`: 增补 service API / HTTP surface 必须有独立目录边界的要求。

## Impact

- 影响代码：
  - `apps/agent-cli/src/agent-service*.ts`
  - `apps/agent-cli/src/server.ts`
  - `apps/agent-cli/src/entrypoints/*.ts`
  - `apps/agent-cli/src/cli/index.ts`
- 影响测试：
  - `apps/agent-cli/test/unit/agent-service*.test.ts`
  - `apps/agent-cli/test/unit/entrypoints/*.test.ts`
  - `apps/agent-cli/test/smoke/prd12-service-api-smoke.ts`
- 影响文档：
  - `apps/agent-cli/README.md`
  - `docs/learning/claude-code/operations/*`
  - `openspec/specs/production-runtime-architecture/spec.md`
