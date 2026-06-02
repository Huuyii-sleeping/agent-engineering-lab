## Why

agent 与 BFF 底座已经具备 Web 调用边界，下一步需要把 `web-console` 从只读 Dashboard 转成可交互的本地开发 Chat 控制台。该变更先实现一个可用的 Chat 首屏，让用户能通过 Web 创建/选择 session、发送消息并查看 transcript。

## What Changes

In Scope:
- 将 `apps/web-console` 首屏改造成本地开发 Chat Console。
- Web 只调用 BFF `/api/*`，不直接访问 agent runtime、本地文件或 agent service。
- 支持 health 状态、session list、create session、select session、load transcript、send message、busy/error 状态。
- 页面结构参考 Codex 类开发工具布局：左侧 session 列表，中间 Chat 主区，右侧 session/status 信息面板。
- Vite dev 通过 proxy 把 `/api` 转发到 BFF。
- Web Chat v1 允许按页面真实交互需要小范围补充 BFF endpoint；新增 endpoint 必须配套测试，并且只做转发/聚合/DTO 适配/错误标准化。
- 新增 Web API client 测试，覆盖 BFF endpoint 调用、message body 映射和错误处理。

Out of Scope:
- 不做登录、多用户、组织权限。
- 不做完整 Dashboard、审计中心、任务中心或设置页。
- 不实现完整 tool approval UI；v1 只展示 error/blocked 信息。
- 不实现 WebSocket；实时能力后续基于 BFF SSE 增量添加。
- 不让 Web 直接调用 agent runtime 或直接读 `.audit`、`.observability`、`.security` 文件。
- 不重命名 `apps/agent-cli`。

## Capabilities

### New Capabilities
- `web-chat-console`: 定义本地 Web Chat 控制台的页面结构、核心交互和 BFF 调用边界。

### Modified Capabilities
- `web-bff-control-plane`: BFF 允许随 Web Chat v1 的真实交互需求小步补充 endpoint，但不得扩大成通用后端平台。

## Impact

- 主要影响 `apps/web-console/src/` 与 `apps/web-console/vite.config.ts`。
- 可能小范围影响 `apps/bff/`，仅限 Web Chat v1 必需 endpoint。
- 新增或更新 Web 测试脚本与依赖。
- 不改变 agent harness 执行语义。
