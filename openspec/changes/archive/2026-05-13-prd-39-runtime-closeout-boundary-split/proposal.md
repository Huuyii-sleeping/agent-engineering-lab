## Why

PRD-36 到 PRD-38 已经分别完成 QueryModel、QueryToolStage 和 QueryFinalization 收口。剩余 query runtime 与服务入口的聚合点继续拆成多轮会增加文档和归档成本，因此本轮合并处理 runtime 剩余编排边界。

本轮只做边界拆分和复查，不改变 query loop、notification、user prompt hook、session service 或 release gate 的对外行为。

## What Changes

- 新增 QueryEngine round state / loop metadata 边界。
- 新增 QueryNotifications formatter / recorder 边界。
- 新增 QueryRuntime user prompt submit 边界。
- 新增 AgentService session helper 边界。
- 更新 `query-engine.ts`、`query-notifications.ts`、`query-runtime.ts`、`agent-service.ts` 为更薄的 orchestration / adapter。
- 新增 focused tests 与中文学习沉淀文档。
- 更新当前对话交接文档。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `production-runtime-architecture`: 增加剩余 runtime closeout 必须区分 engine round state、notification formatter/recorder、user prompt submit 和 service session helper 的要求。
- `core-agent-loop`: 明确 runtime closeout 必须保持主循环 stage 顺序、trace、stop stage 与 tool/finalization 语义不变。
- `scheduled-prompt-runtime`: 明确 notification 边界拆分必须保持 scheduled prompt 注入文案与 drain 语义不变。
- `agent-service-sessions`: 明确 session helper 拆分必须保持 session isolation、busy guard 和 summary shape 不变。
- `architecture-learning-knowledge-base`: 要求本轮合并收口沉淀中文学习文档。
- `release-readiness-closeout`: 明确本轮最终收口必须记录验证命令并保持 active changes 清空。

## Impact

- 影响代码：
  - `apps/agent-cli/src/runtime/query-engine.ts`
  - `apps/agent-cli/src/runtime/query-engine-round.ts`
  - `apps/agent-cli/src/runtime/query-notifications.ts`
  - `apps/agent-cli/src/runtime/query-notification-formatters.ts`
  - `apps/agent-cli/src/runtime/query-notification-recorders.ts`
  - `apps/agent-cli/src/runtime/query-runtime.ts`
  - `apps/agent-cli/src/runtime/query-user-prompt.ts`
  - `apps/agent-cli/src/agent-service.ts`
  - `apps/agent-cli/src/agent-service-sessions.ts`
  - focused tests
- 影响文档：
  - 新增 `PRD-39`
  - 新增 OpenSpec change
  - 新增学习沉淀文档
  - 更新当前对话交接文档
- 不执行 `git push`，只做本地 commit。
