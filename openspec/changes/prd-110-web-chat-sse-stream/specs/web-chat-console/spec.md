## MODIFIED Requirements

### Requirement: Web Chat Console MUST support realtime chat interactions
Web Chat Console MUST show user messages immediately and render assistant responses incrementally through a message-level stream.

#### Scenario: User sends a chat message
- **WHEN** 用户提交消息
- **THEN** Web 立即插入用户消息
- **AND** Web 创建 assistant 占位消息
- **AND** assistant 内容通过 SSE delta 逐步追加展示
- **AND** stream 完成后 Web 刷新当前 session 与历史列表

#### Scenario: Message stream fails
- **WHEN** 消息级 SSE 返回错误事件或网络失败
- **THEN** Web 显示可读错误
- **AND** 不吞掉已经展示的用户消息
