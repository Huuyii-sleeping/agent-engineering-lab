## ADDED Requirements

### Requirement: Memory persistence MUST redact secret-like content before storage
记忆持久化 MUST 在写入 `.memory/*.jsonl` 前脱敏 secret-like 内容，避免长期记忆直接保存 token、password、api key 等敏感值。

#### Scenario: `memory_add` 写入敏感文本
- **WHEN** 调用 `memory_add(content)` 且内容中包含 secret-like 字符串
- **THEN** 系统将脱敏后的内容写入短期与长期记忆
- **AND** 原始敏感值不得直接写入 `.memory/*.jsonl`

#### Scenario: 自动抽取写入敏感文本
- **WHEN** 自动记忆抽取命中包含 secret-like 内容的候选项
- **THEN** 系统写入脱敏后的记忆条目
- **AND** 后续 `memory_list` / `memory_search` 返回脱敏后的内容
