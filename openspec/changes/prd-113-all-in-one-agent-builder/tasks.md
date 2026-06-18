## 1. OpenSpec 文档

- [x] 1.1 创建 proposal/design/tasks/spec artifacts。

## 2. Builder 状态与工具函数

- [x] 2.1 新增 Agent Builder catalog 与配置类型。
- [x] 2.2 新增本地存储读写、配置归一化和 toggle helper。
- [x] 2.3 补充配置 helper 单元测试。

## 3. Web Console 页面实现

- [x] 3.1 将主 view 扩展为 builder/chat/settings。
- [x] 3.2 左侧导航通过应用生成入口打开 Agent Builder 子页面，并保留默认聊天页。
- [x] 3.3 新增 Agent Builder 工作台：skill 池、SOP 编排、预览和保存状态。
- [x] 3.4 补充 Builder 响应式样式，避免内容重叠或文本溢出。

## 4. 验证与收口

- [x] 4.1 运行 `pnpm --filter agent-web-console test`。
- [x] 4.2 运行 `pnpm build`。
- [x] 4.3 尝试浏览器验证本地页面；若浏览器策略拦截，说明限制。
- [x] 4.4 清理测试/构建产物并提交本地 commit。
