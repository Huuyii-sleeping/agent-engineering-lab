## Decisions

1. 本轮使用前端本地摘要。
   - 理由：已有 session detail 包含 transcript，可以不改变 BFF 和 agent service 协议。

2. 标题优先级为：用户重命名 > 首条用户消息摘要 > 新对话/hash fallback。
   - 理由：用户手动编辑应拥有最高优先级；首条用户消息通常最能代表会话意图；空会话没有可摘要内容。

3. 历史列表异步补全标题。
   - 理由：session list API 当前不返回消息内容，Web 在后台按需拉取 session detail 生成标题，避免阻塞列表初次渲染。

4. 后续生产级增强可迁移到模型生成。
   - 理由：更好的标题通常由模型总结首轮或多轮对话，并持久化到 session metadata；本轮先实现轻量版本。
