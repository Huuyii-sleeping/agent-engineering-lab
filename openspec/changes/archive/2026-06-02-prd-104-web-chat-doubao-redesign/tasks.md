## 1. 测试先行

- [x] 1.1 新增主题工具测试，覆盖默认主题、无效存储值归一化、主题切换。
- [x] 1.2 验证测试在实现前失败。

## 2. 主题基础

- [x] 2.1 新增 Web theme 工具模块，封装主题解析、读取、写入与切换。
- [x] 2.2 在 React App 初始化和切换时同步 `document.documentElement.dataset.theme`。

## 3. 豆包式 Chat UI

- [x] 3.1 重构首屏结构为左侧导航/历史 + 中间 Chat 会话 + 底部悬浮 composer。
- [x] 3.2 增加顶部会话栏、连接状态、刷新与主题切换按钮。
- [x] 3.3 重新设计空状态、错误态、消息气泡、session item。
- [x] 3.4 使用 CSS variables 实现 dark/light 双主题。
- [x] 3.5 验证桌面与移动端布局无横向溢出。

## 4. 验证与收口

- [x] 4.1 运行 `pnpm --filter agent-web-console test`。
- [x] 4.2 运行 `pnpm build`。
- [x] 4.3 浏览器验证本地页面视觉、主题切换、移动端布局。
- [x] 4.4 运行 `openspec validate "prd-104-web-chat-doubao-redesign" --type change` 与 `openspec validate --all`。
- [x] 4.5 归档 OpenSpec change，清理产物并提交本地 commit。
