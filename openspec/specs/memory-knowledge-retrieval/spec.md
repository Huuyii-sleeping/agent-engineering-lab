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

### Requirement: Memory surfaces MUST disclose memory classes and support state
memory 相关 surface MUST 明确区分当前仓库已经实现的本地 memory 类型，与尚未实现的 shared/team memory 类型，避免把所有 memory 都描述成同一数据面。

#### Scenario: User inspects memory classes
- **WHEN** 用户检查 memory 数据治理信息
- **THEN** 系统列出短期记忆、长期记忆、会话摘要或等价本地记忆类别
- **AND** 将 shared/team memory sync 显式标记为 `保留缺口` 或 `未支持`，如果当前仓库没有该能力

#### Scenario: Memory injection reason is surfaced
- **WHEN** 某类 memory 被用于当前模型请求
- **THEN** 系统能够说明被注入的是哪一类 memory
- **AND** 解释其进入模型的原因，例如相关性命中、上下文补偿或长期偏好保持

### Requirement: Memory runtime MUST support disabling automatic extraction and injection
memory 运行时 MUST 支持独立关闭自动抽取与自动注入，使用户可以阻断“从输入自动沉淀记忆”与“从本地记忆自动回流进模型请求”这两条默认路径，而不是只能在工件写入后再补救。

#### Scenario: Auto extraction is disabled
- **WHEN** 用户启用 `memory.manual_only`、`memory.disabled` 或等价隐私姿态
- **THEN** 系统不再根据普通用户输入自动抽取新 memory
- **AND** 只有显式 `memory_add` 或等价显式操作才允许新增 memory

#### Scenario: Auto injection is disabled
- **WHEN** 用户启用 no-inject、manual-only 或等价隐私姿态
- **THEN** 系统不再自动将 `memory_context` 注入模型请求
- **AND** prompt inspection / governance surface 能说明该数据类别已被抑制

### Requirement: Memory minimization posture MUST remain honest about unsupported team sync
即使本地 memory 支持关闭或最小化，系统也 MUST 继续将 shared team memory / memory sync 标记为 `reserved_gap` 或 `未支持`，不得把“本地 memory 已可关闭”误写成“团队记忆隐私能力已完整支持”。

#### Scenario: User inspects memory privacy capabilities
- **WHEN** 用户检查 memory 相关隐私控制
- **THEN** 系统区分本地 memory 最小化控制与团队级 memory sync 缺口
- **AND** 不将二者混为同一个能力状态

