# local-data-retention-controls Specification

## Purpose
TBD - created by archiving change prd-70-security-analysis-gap-closeout. Update Purpose after archive.
## Requirements
### Requirement: Sensitive local artifacts MUST declare retention and cleanup policy
系统 MUST 为 `.sessions`、`.transcripts`、`.memory`、`.observability`、`.security`、`.audit` 等本地持久化数据声明统一的 retention class、默认保留期与 cleanup 行为，而不是由各模块各自隐式长期保留。

#### Scenario: Cleanup job processes expired local artifacts
- **WHEN** 某类本地持久化数据超过其声明的默认保留期
- **THEN** 系统按对应 retention class 执行清理、裁剪或归档
- **AND** 清理结果可被审计

### Requirement: Sensitive local artifacts SHALL support explicit export and deletion
系统 SHALL 为高敏感本地数据提供显式导出与删除语义，避免 session、transcript、memory 或 audit 数据只能被被动累积。

#### Scenario: User deletes one retained artifact family
- **WHEN** 用户显式请求删除某个 session 或其关联 transcript / prompt dump / observability 数据
- **THEN** 系统删除对应持久化记录或标记为已清除
- **AND** 后续浏览与查询入口不再返回该数据

### Requirement: Sensitive local artifacts MUST support no-persistence overrides
高敏感本地工件至少包括 session、transcript snapshot 与 prompt dump，系统 MUST 支持 `no_session_persistence`、zero-retention 或等价 no-persistence override，使用户可以选择从源头避免这些工件被持久化，而不只是依赖事后 TTL 清理。

#### Scenario: Session persistence is disabled
- **WHEN** 用户启用 no-persistence 或等价隐私姿态
- **THEN** 系统不再把新的 session / transcript / prompt dump 写入对应持久化目录
- **AND** 不要求用户等待保留期到期后再删除

#### Scenario: Runtime exits under no-persistence posture
- **WHEN** 当前运行时处于 no-persistence 或 zero-retention 姿态并结束执行
- **THEN** 系统不保留本轮新增的高敏感运行工件
- **AND** 治理面能够说明该姿态已阻断本轮本地落盘

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

