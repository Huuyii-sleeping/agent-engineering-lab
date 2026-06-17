## Decisions

1. BFF 使用 NestJS。
   - 理由：BFF 开始承载业务接口后，需要模块、Controller、Service、DTO 和统一错误处理边界；Nest 比原生 http 更适合持续扩展。

2. 保持 `/api/*` 对外路径兼容。
   - 理由：前端已经稳定依赖这些路径，迁移 BFF 框架不应该造成 Web 侧聊天、SSE 和会话功能回归。

3. 第一阶段本地业务数据使用 JSON 文件存储。
   - 理由：当前需求是本地控制台，不需要立即引入数据库；文件存储足够支撑个人资料和偏好设置，同时把存储能力封装在 service 内，后续可替换。

4. 前后端按两条路线并行推进。
   - 后端路线：Nest 框架迁移、兼容代理、业务 API。
   - 前端路线：API client、设置页数据加载、保存反馈。

5. 业务 API 不直接调用 agent service。
   - 理由：个人资料和偏好属于 Web 控制台业务状态，应该由 BFF 管理；agent service 保持执行任务和对话职责。

## API Sketch

```text
GET /api/profile
PUT /api/profile
GET /api/settings
PATCH /api/settings
```

`profile` 字段：
- `displayName`
- `description`

`settings` 字段：
- `theme`
- `language`
- `shortcutHints`
- `markdownRendering`
