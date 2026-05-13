## ADDED Requirements

### Requirement: Runtime notification boundary corrections MUST preserve scheduled prompt injection semantics
Runtime notification 边界校正 MUST 保持 scheduled prompt drain、system message 注入文案、console summary 和 notification observability 语义不变。

#### Scenario: scheduled prompt 注入
- **WHEN** 存在待消费的 scheduled prompt notifications
- **THEN** 系统继续生成 `<scheduled_prompt>` block 与 scheduled prompt instruction，并追加到动态 system messages

#### Scenario: scheduled prompt 观测
- **WHEN** scheduled prompt notification 被收集
- **THEN** 系统继续记录 source 为 `schedule` 的 notification event，payload 保持 scheduleId、firedAt、recurring 和 prompt
