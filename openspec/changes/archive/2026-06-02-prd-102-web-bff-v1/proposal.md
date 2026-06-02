## Why

Web Console 不应直接调用 agent runtime 或读取 agent 本地运行文件；需要一个独立 BFF 层把浏览器请求转成受控的 agent service 调用。该变更把当前 monorepo 拆出清晰的 `bff` app，为后续 Web 端开发提供稳定 API 边界。

## What Changes

In Scope:
- 新增 `apps/bff` workspace package，作为 Web-facing backend-for-frontend。
- BFF 暴露 `/api/*` JSON API，并转发到现有 agent HTTP service。
- 支持 health、session list/create/detail、message send、transcript、event stream、audit events、security findings 的 v1 接口。
- agent service 增加少量只读 HTTP endpoint，用于 BFF 转发 audit events 与 security findings。
- BFF 对上游不可用、上游非 2xx、非法请求返回标准化错误。
- 新增 BFF 单元/集成测试，验证请求转发路径、body 映射、错误处理和 SSE 转发。

Out of Scope:
- 不实现登录、账号、多租户、组织权限或云端部署。
- 不新增数据库或持久化层。
- 不重命名 `apps/agent-cli`。
- 不实现 Web UI 改造。
- 不让 BFF 直接执行 shell/file tool 或重新实现 agent runtime。
- 不实现 WebSocket；实时流 v1 只支持 SSE 转发。

## Capabilities

### New Capabilities
- `web-bff-control-plane`: 定义 Web Console BFF 的转发边界、接口、错误处理和测试要求。

### Modified Capabilities
- `agent-service-sessions`: agent service 需要提供 BFF 可消费的只读治理 endpoint，并继续保持 session/chat API 稳定。
- `local-runtime-audit`: 本地 audit ledger 需要支持通过 agent service 只读查询给 BFF 转发。
- `secret-scanning-dlp-guards`: 本地 secret findings 需要支持通过 agent service 只读查询给 BFF 转发。

## Impact

- 新增 `apps/bff/` package、源码、测试和构建脚本。
- 更新根 `package.json` scripts，加入 BFF dev/build/test 入口。
- 更新 `apps/agent-cli/src/service-api/index.ts` 的只读 HTTP endpoint。
- 不改变 agent runtime 执行语义，不改变 Web UI。
