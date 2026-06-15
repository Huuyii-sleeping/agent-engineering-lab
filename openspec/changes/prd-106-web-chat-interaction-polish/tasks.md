## 1. SSE 实时同步

- [x] 1.1 为 Web API 层新增 SSE event 类型与 `EventSource` 创建入口。
- [x] 1.2 在 React App 初始化时订阅 `/api/events/stream`，维护 connected/error 状态。
- [x] 1.3 收到 SSE 事件后刷新 sessions，并在有 active session 时刷新 transcript。

## 2. Markdown 消息渲染

- [x] 2.1 引入 Markdown 渲染依赖。
- [x] 2.2 将 assistant/system/tool 消息改为 Markdown 渲染，user 消息保持纯文本气泡。
- [x] 2.3 补充 Markdown 样式，覆盖段落、列表、代码块、引用和链接。

## 3. 侧栏与历史列表

- [x] 3.1 实现左上角侧栏折叠/展开状态与布局样式。
- [x] 3.2 历史对话按更新时间倒序，只显示最近 3 条。
- [x] 3.3 保证新建 session 后新 session 出现在可见历史列表。

## 4. 图标化与文档

- [x] 4.1 将刷新、主题、快捷入口和发送按钮尽量图标化，保留 `aria-label`。
- [x] 4.2 更新 `apps/web-console/README.md`，说明 SSE、Markdown、历史限制与侧栏折叠。

## 5. 验证与收口

- [x] 5.1 浏览器验证 SSE 状态、Markdown、侧栏折叠、历史 3 条和图标化首屏。
- [x] 5.2 运行 `pnpm --filter agent-web-console test`。
- [x] 5.3 运行 `pnpm --filter agent-web-console build`。
- [x] 5.4 运行 `pnpm build`。
- [x] 5.5 清理本轮构建/测试产物。
