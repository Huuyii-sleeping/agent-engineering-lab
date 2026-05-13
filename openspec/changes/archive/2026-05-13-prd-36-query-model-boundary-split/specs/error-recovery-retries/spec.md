## ADDED Requirements

### Requirement: QueryModel boundary corrections MUST preserve compact continuation backoff and failure semantics
QueryModel 边界校正 MUST 保持 preflight compact、response continuation、transport backoff 和 recovery failure 的现有语义不变。

#### Scenario: preflight token 超限
- **WHEN** request messages 的 token estimate 超过 compact threshold
- **THEN** 系统继续记录 recovery decision，执行 auto compact，并用压缩后的 messages 重试

#### Scenario: 模型响应被截断
- **WHEN** 模型响应需要 continuation
- **THEN** 系统继续追加上一段 assistant content 与 continuation prompt，并合并最终 assistant content

#### Scenario: recovery 失败
- **WHEN** recovery selector 返回 fail 或 compact / continuation / transport 预算耗尽
- **THEN** 系统继续写入相同结构的 recovery failure assistant message，并返回 `recovery_failed`
