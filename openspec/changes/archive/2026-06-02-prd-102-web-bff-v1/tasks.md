## 1. 测试先行

- [x] 1.1 新增 BFF 转发测试：`GET /api/health` 转发 agent `/health` 并返回 BFF 与 agent 状态。
- [x] 1.2 新增 BFF session 测试：list/create/detail/transcript 转发到 agent session endpoint。
- [x] 1.3 新增 BFF message 测试：`POST /api/sessions/:id/messages` 映射到 agent `/chat`。
- [x] 1.4 新增 BFF governance 测试：audit/security API 转发到 agent 只读 endpoint。
- [x] 1.5 新增 BFF 错误与 SSE 测试：上游不可用返回 502，`/api/events/stream` 转发 SSE。

## 2. BFF 实现

- [x] 2.1 新增 `apps/bff` package、tsconfig、src/test 目录和基础 scripts。
- [x] 2.2 实现 BFF config，支持 `BFF_PORT` 与 `AGENT_SERVICE_BASE_URL`。
- [x] 2.3 实现 BFF HTTP server、JSON body parsing、CORS/OPTIONS、标准错误响应。
- [x] 2.4 实现 session、message、transcript、audit、security 的 JSON 转发路由。
- [x] 2.5 实现 `/api/events/stream` SSE 转发。

## 3. Agent Service 只读端点

- [x] 3.1 在 agent service 增加 `GET /audit/events`，支持 limit、session_id、trace_id、category。
- [x] 3.2 在 agent service 增加 `GET /security/findings`，返回 tracked secret findings。

## 4. Monorepo 与验证

- [x] 4.1 更新根脚本，加入 `dev:bff`、`build:bff`、`test:bff`。
- [x] 4.2 运行 BFF 测试与 agent service 相关测试。
- [x] 4.3 运行 `pnpm build` 与 `pnpm --dir apps/agent-cli run release:check`。
- [x] 4.4 运行 `openspec status --change "prd-102-web-bff-v1" --json` 与 `openspec validate "prd-102-web-bff-v1" --type change`。
- [ ] 4.5 归档 OpenSpec change，运行 `openspec validate --all`。
- [ ] 4.6 清理本轮运行产物并提交本地 commit。
