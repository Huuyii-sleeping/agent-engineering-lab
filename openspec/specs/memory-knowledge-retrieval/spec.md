# memory-knowledge-retrieval Specification

## Purpose
定义 Agent 的持久化记忆、轻量检索、可解释命中与主循环注入能力，支持跨会话恢复用户偏好、约束和历史决策，同时受 token 预算约束。
## Requirements
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

### Requirement: Memory persistence SHALL honor lifecycle and deletion controls
memory 在完成脱敏后，SHALL 继续接入 retention、过期清理与显式删除 contract，避免 long-term memory 默认无限期累积。

#### Scenario: Retention policy expires long-term memory entries
- **WHEN** 某批 long-term memory 条目达到保留阈值
- **THEN** 系统按策略删除、裁剪或降级这些条目
- **AND** 后续 `memory_list` / `memory_search` 不再返回已清理内容

