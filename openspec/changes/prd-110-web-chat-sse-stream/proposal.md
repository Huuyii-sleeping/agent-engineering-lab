## Why

Web 发送消息目前使用普通 POST，等待 agent 完整返回后一次性刷新 transcript。虽然页面已有全局 SSE 事件流，但它只通知会话开始/完成，不能让 assistant 回复在消息区逐步展示。需要新增消息级 SSE 通道，让前端按 delta 渲染回复。

## What Changes

In Scope:
- BFF 新增消息级 SSE endpoint。
- Agent service 新增消息级 SSE endpoint。
- Agent runtime 支持模型 token delta 回调。
- Web API 新增 fetch-based SSE parser，用于 POST 后读取流式事件。
- Web 发送消息时先插入 assistant 占位，再按 SSE delta 更新内容。
- 完成后刷新 session list 和 active session。

Out of Scope:
- 不改变 agent session 存储格式。
