## ADDED Requirements

### Requirement: Session cleanup controls MUST cover session journals

session journal MUST 服从现有本地持久化治理，包括 no-persistence、retention 过期清理和显式删除语义。

#### Scenario: No-persistence skips journal writes
- **WHEN** 本地持久化被禁用
- **THEN** 系统不得写入新的 session journal
- **AND** 仍不得写入新的 session 快照

#### Scenario: Delete removes session journal
- **WHEN** 用户或系统删除某个 session
- **THEN** 系统删除该 session 的 `.json` 快照
- **AND** 系统删除该 session 的 `.jsonl` journal

#### Scenario: Expired journal is ignored
- **WHEN** session journal 的最新有效记录已经超过 retention metadata
- **THEN** 系统不从该 journal 恢复 session
- **AND** 系统清理或忽略该过期 journal
