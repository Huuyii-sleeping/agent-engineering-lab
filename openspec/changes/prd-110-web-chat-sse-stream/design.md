## Decisions

1. 使用 fetch 读取 SSE。
   - 理由：浏览器 EventSource 只支持 GET，本场景需要 POST message body。

2. BFF SSE 事件类型为 `message.delta`、`message.done`、`message.error`。
   - 理由：前端只关心增量文本、完成状态和错误状态，事件语义稳定。

3. 当前 BFF 从现有 `/chat` JSON response 切分 assistant 文本为 delta。
   - 理由：现有 agent runtime 暂不暴露 token delta，本轮先落地 SSE 传输与前端流式渲染；后续可把 BFF 上游替换为真正 token stream。

4. 前端保留最终刷新。
   - 理由：SSE 增量用于即时视觉反馈，最终仍以 agent service 持久化 session 为准。
