## ADDED Requirements

### Requirement: QueryFinalization boundary corrections MUST preserve Stop hook payload and injection semantics
QueryFinalization 边界校正 MUST 保持 Stop hook payload 和补充 system message 注入语义不变。

#### Scenario: Stop hook 触发
- **WHEN** query round 收尾阶段运行 Stop hook
- **THEN** hook payload 继续包含 session id、trace id、round、outcome 和 tool call count

#### Scenario: Stop hook 注入消息
- **WHEN** Stop hook 返回补充 messages
- **THEN** 系统继续将这些消息作为 system messages 追加到会话历史
