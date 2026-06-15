## 1. 消息级 SSE

- [x] 1.1 BFF 新增消息级 SSE endpoint。
- [x] 1.2 Web API 新增 POST SSE parser。
- [x] 1.3 Web 发送消息时按 SSE delta 更新 assistant 占位消息。
- [x] 1.4 保留最终刷新 session 的一致性。
- [x] 1.5 新增 BFF 和 Web API 单元测试。

## 2. 验证与收口

- [x] 2.1 浏览器验证标题摘要并通过单元测试覆盖消息级 SSE 事件。
- [x] 2.2 运行 `pnpm --filter agent-web-console test`。
- [x] 2.3 运行 `pnpm --filter agent-bff test`。
- [x] 2.4 运行 `pnpm --filter agent-web-console build`。
- [x] 2.5 运行 `pnpm build`。
- [x] 2.6 清理本轮构建/测试产物。
