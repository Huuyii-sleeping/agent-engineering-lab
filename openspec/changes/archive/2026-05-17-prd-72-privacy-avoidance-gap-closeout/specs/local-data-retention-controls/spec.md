## ADDED Requirements

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
