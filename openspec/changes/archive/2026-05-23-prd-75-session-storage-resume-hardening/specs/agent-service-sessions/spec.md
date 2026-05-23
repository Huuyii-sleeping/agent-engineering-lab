## ADDED Requirements

### Requirement: Session persistence MUST maintain an append-only journal

session 持久化 MUST 为每个 session 维护 append-only JSONL journal，作为 resume 的本地事实源，同时保留现有快照文件兼容行为。

#### Scenario: Session save appends journal row
- **WHEN** 系统保存某个 session
- **THEN** `.sessions/session_<id>.jsonl` 追加一行可解析 JSON
- **AND** 该行包含 session id、history、runtime state、生命周期 metadata 与脱敏后的内容

#### Scenario: Multiple saves keep append-only history
- **WHEN** 同一 session 被连续保存多次
- **THEN** journal 中保留多条记录
- **AND** 系统不得通过覆盖 journal 文件来丢弃旧记录

### Requirement: Session resume MUST prefer journal reconstruction

session 恢复 MUST 优先从 append-only journal 重建最新 session；当 journal 不存在或无法提供有效记录时，系统 SHALL 回退读取旧 JSON 快照。

#### Scenario: Resume from journal
- **WHEN** 某个 session 同时存在 journal 与旧快照
- **THEN** 系统从 journal 的最后有效 session 记录恢复 history 与 runtime state

#### Scenario: Fallback to legacy snapshot
- **WHEN** 某个 session 只有旧 `.json` 快照
- **THEN** 系统继续恢复该 session

#### Scenario: List merges journal and legacy snapshots
- **WHEN** 系统列出可恢复 session
- **THEN** journal session 与旧快照 session 都会出现在结果中
- **AND** 同一 session id 同时存在 journal 与快照时以 journal 恢复结果为准
