## Why

当前 Web BFF 主要使用原生 `node:http` 转发 agent service 请求。随着 Web 端个人设置、用户偏好和本地业务状态逐步增加，BFF 不再只是代理层，需要承担可测试、可扩展的业务接口。继续在单个 `server.ts` 中堆业务会让路由、状态、错误处理和测试维护变困难。

## What Changes

In Scope:
- 将 `apps/bff` 迁移到 NestJS 应用结构。
- 保持现有 Web API 路径兼容，包括会话、健康检查、审计、安全和 SSE/流式聊天代理。
- 新增 BFF 本地业务接口：
  - `GET /api/profile`
  - `PUT /api/profile`
  - `GET /api/settings`
  - `PATCH /api/settings`
- 前端个人设置页改为通过 BFF API 读取和保存个人资料，不再直接依赖浏览器 localStorage 作为业务来源。
- 使用文件存储作为第一阶段本地持久化实现，后续可替换为 SQLite。

Out of Scope:
- 不接入登录、账号体系或远端用户资料。
- 不改变 agent service 对话协议。
- 不重做 Web 整体路由体系。
