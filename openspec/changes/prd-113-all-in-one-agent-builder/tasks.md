## 1. OpenSpec 文档

- [x] 1.1 创建 proposal/design/tasks/spec artifacts。
- [x] 1.2 将当前变更范围调整为 `Landing -> Agent 管理 -> Agent 测试聊天`。

## 2. BFF Agent Profiles

- [x] 2.1 新增 Agent profile 类型、归一化和本地持久化 service。
- [x] 2.2 新增 `GET/POST/PUT/DELETE /api/agents` 控制器接口。
- [x] 2.3 补充 BFF CRUD 持久化单元测试。

## 3. Web API Client

- [x] 3.1 新增 Agent profile DTO、归一化和 CRUD API client。
- [x] 3.2 补充 Web API client 单元测试。

## 4. Web Console 页面实现

- [x] 4.1 将“立即开始”入口改为进入 Agent 管理界面。
- [x] 4.2 新增 Agent 管理页，支持列表、创建、编辑、保存和删除 agent。
- [x] 4.3 在 Agent 详情中支持 skill 选择、custom actions 和 system prompt 配置。
- [x] 4.4 将“使用 / 测试”接入原聊天页，并展示当前测试 agent 摘要。
- [x] 4.5 补充 Agent 管理与测试摘要响应式样式，避免内容重叠或文本溢出。

## 5. 验证与收口

- [x] 5.1 运行 `pnpm --filter agent-bff test`。
- [x] 5.2 运行 `pnpm --filter agent-web-console test`。
- [x] 5.3 运行 `pnpm build`。
- [x] 5.4 尝试浏览器验证本地页面；若浏览器策略拦截，说明限制。
- [x] 5.5 清理测试/构建产物并提交本地 commit。
