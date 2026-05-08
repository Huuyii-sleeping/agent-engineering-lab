## ADDED Requirements

### Requirement: Agent SHALL persist memory across sessions
系统 SHALL 将短期与长期记忆持久化到 `.memory/*.jsonl`，并在重启后可恢复读取。

#### Scenario: 重启后读取长期记忆
- **WHEN** 已写入长期记忆并重启进程
- **THEN** `memory_search` 仍可检索到历史条目

### Requirement: Memory search MUST return explainable hits
记忆检索 MUST 返回命中条目及其 `score` 与来源信息。

#### Scenario: 关键词检索返回分数
- **WHEN** 调用 `memory_search(query)`
- **THEN** 返回结果中包含 `hits[].score` 与 `hits[].source`

### Requirement: Memory injection MUST obey token budget
记忆注入 MUST 受可配置 token 上限控制，避免挤占主上下文。

#### Scenario: 注入受预算限制
- **WHEN** 命中记忆较多
- **THEN** 仅注入预算内条目，并返回估算 token

