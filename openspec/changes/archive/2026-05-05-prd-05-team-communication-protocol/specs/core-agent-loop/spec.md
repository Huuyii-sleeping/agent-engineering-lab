## MODIFIED Requirements

### Requirement: Agent loop SHALL handle tool-calling rounds deterministically
主循环 MUST 在每轮请求前注入团队消息通知摘要（若存在），同时保持既有工具调用顺序与回填契约不变。

#### Scenario: 团队消息通知注入
- **WHEN** 团队收件箱出现新消息通知
- **THEN** 主循环在下一轮模型请求前附加通知 system 消息
