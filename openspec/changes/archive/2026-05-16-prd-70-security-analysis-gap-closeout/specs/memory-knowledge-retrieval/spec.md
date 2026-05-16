## ADDED Requirements

### Requirement: Memory persistence SHALL honor lifecycle and deletion controls
memory 在完成脱敏后，SHALL 继续接入 retention、过期清理与显式删除 contract，避免 long-term memory 默认无限期累积。

#### Scenario: Retention policy expires long-term memory entries
- **WHEN** 某批 long-term memory 条目达到保留阈值
- **THEN** 系统按策略删除、裁剪或降级这些条目
- **AND** 后续 `memory_list` / `memory_search` 不再返回已清理内容

