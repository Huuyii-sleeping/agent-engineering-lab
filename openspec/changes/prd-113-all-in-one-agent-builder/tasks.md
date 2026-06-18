## 1. OpenSpec 文档

- [x] 1.1 创建 proposal/design/tasks/spec artifacts。

## 2. 工作台状态与工具函数

- [x] 2.1 新增 Agent Builder catalog 与配置类型。
- [x] 2.2 新增本地存储读写、配置归一化和 toggle helper。
- [x] 2.3 补充配置 helper 单元测试。
- [x] 2.4 新增 SkillHub 下载状态读写和单元测试。

## 3. Web Console 页面实现

- [x] 3.1 新增项目介绍首页和“立即开始”入口。
- [x] 3.2 将进入后的主区域改为 Tab 工作台。
- [x] 3.3 将原聊天页挂载为 `Agent 测试` Tab。
- [x] 3.4 新增 SkillHub 风格的 `Skill 加载` Tab。
- [x] 3.5 补充 Landing、Tabs、SkillHub 响应式样式，避免内容重叠或文本溢出。

## 4. 验证与收口

- [x] 4.1 运行 `pnpm --filter agent-web-console test`。
- [x] 4.2 运行 `pnpm build`。
- [x] 4.3 尝试浏览器验证本地页面；若浏览器策略拦截，说明限制。
- [x] 4.4 清理测试/构建产物并提交本地 commit。
