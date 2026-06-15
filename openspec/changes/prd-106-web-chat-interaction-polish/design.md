## Context

BFF 已提供 `/api/events/stream`，并把请求代理到 agent service `/events`；Web 端目前只通过轮询式请求加载 health、sessions 和 transcript，没有建立 SSE。Chat UI 当前消息内容以 `<p>` 输出，无法渲染 Markdown；左上角侧栏按钮只是视觉控件，没有状态；session 列表直接渲染全部本地历史，真实数据较多时首屏噪音明显。

## Decisions

1. 使用浏览器原生 `EventSource` 接入 SSE。
   - 理由：BFF 已是 SSE endpoint，无需新增依赖或协议。
   - 备选：手写 fetch stream parser。未采用，因为浏览器已有稳定 API，复杂度更高。

2. SSE v1 仅做状态同步，不做 token 级流式输出。
   - 理由：当前 agent service 事件是 bridge/session 事件，不是 assistant token stream；收到事件后刷新 sessions 和当前 transcript 即可提升实时性。
   - 备选：模拟逐 token 流式渲染。未采用，因为会误导真实能力边界。

3. 使用成熟 Markdown 渲染库处理 assistant/system/tool 内容。
   - 理由：Markdown 解析边界复杂，不应在业务组件内手写解析器。
   - 备选：只处理换行、代码块、链接等少量语法。未采用，因为容易遗漏和产生不一致。

4. 历史列表显示最近 3 条 session。
   - 理由：本地开发测试会产生大量 session，默认全量展示会降低可读性。
   - 备选：分页或搜索。未采用，因为本轮只做首屏 polish。

5. 折叠侧栏只影响视觉布局，不卸载 session 状态。
   - 理由：折叠/展开不应丢失当前会话、草稿或连接状态。
   - 备选：移动端抽屉。未采用，因为本轮优先修复桌面按钮行为。

## Risks

- SSE 连接失败时不能影响基础 Chat 请求；需要显示轻量状态并允许继续手动刷新。
- Markdown 渲染会扩大依赖体积；需要用构建验证确认可接受。
- 只显示最近 3 条会让较旧 session 不可见；后续可用搜索/更多历史专门解决。
