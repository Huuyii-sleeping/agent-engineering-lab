## 1. 后端路线：BFF Nest 化

- [x] 1.1 为 `apps/bff` 添加 NestJS 依赖与启动入口。
- [x] 1.2 建立 AppModule、Health/AgentProxy/Profile/Settings 模块边界。
- [x] 1.3 将现有 `/api/health`、`/api/sessions`、`/api/sessions/:id`、`/api/sessions/:id/messages`、`/api/events/stream` 迁移到 Nest Controller。
- [x] 1.4 保持聊天 SSE 流式代理逐块透传。
- [x] 1.5 新增 profile/settings 本地业务 API。
- [x] 1.6 补充 BFF 单元/集成测试。

## 2. 前端路线：接入 BFF 业务接口

- [x] 2.1 Web API client 新增 profile/settings 请求函数。
- [x] 2.2 个人设置页从 BFF 加载 profile。
- [x] 2.3 编辑个人资料通过 `PUT /api/profile` 保存。
- [x] 2.4 主题设置保留当前交互，并为后续 `PATCH /api/settings` 留出接口边界。
- [x] 2.5 补充前端 profile/settings 相关测试。

## 3. 验证与收口

- [x] 3.1 运行 `pnpm --filter agent-bff test`。
- [x] 3.2 运行 `pnpm --filter agent-web-console test`。
- [x] 3.3 运行 `pnpm build`。
- [x] 3.4 浏览器验证个人设置读取、编辑、保存。
- [x] 3.5 清理构建/测试产物。
