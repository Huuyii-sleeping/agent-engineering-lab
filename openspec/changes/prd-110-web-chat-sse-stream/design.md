## Decisions

1. 使用 fetch 读取 SSE。
   - 理由：浏览器 EventSource 只支持 GET，本场景需要 POST message body。

2. BFF SSE 事件类型为 `message.delta`、`message.done`、`message.error`。
   - 理由：前端只关心增量文本、完成状态和错误状态，事件语义稳定。

3. agent service 暴露 `/chat/stream`，BFF 只负责透传上游 SSE。
   - 理由：BFF 如果等待 `/chat` 完整 JSON 再切分文本，用户仍会感知为非流式；delta 必须从模型请求层一路传到 Web。

4. agent runtime 在提供 `onAssistantDelta` 时使用模型 stream 请求。
   - 理由：Web 对话区需要随着模型输出实时追加内容，而不是在模型完成后一次性刷新。

5. 前端保留最终刷新。
   - 理由：SSE 增量用于即时视觉反馈，最终仍以 agent service 持久化 session 为准。
