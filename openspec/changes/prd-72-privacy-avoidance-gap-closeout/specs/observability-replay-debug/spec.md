## ADDED Requirements

### Requirement: Local observability MUST support minimized and disabled collection postures
本地 observability MUST 支持至少 `default`、`minimal`、`disabled` 三类等价姿态，使用户可以减少或关闭事件、指标与 replay 数据的本地写入，而不是只能接受默认持续记录。

#### Scenario: Observability runs in minimized mode
- **WHEN** 用户启用 `observability.minimal` 或等价隐私姿态
- **THEN** 系统仅保留最小必要的本地诊断或审计信号
- **AND** 不继续按默认粒度写入完整 trace / span / replay 辅助数据

#### Scenario: Observability is disabled
- **WHEN** 用户启用 `observability.disabled` 或等价隐私姿态
- **THEN** 系统不再写入新的普通 observability 事件与指标快照
- **AND** 治理面能够说明当前本地观测面已被关闭或最小化

### Requirement: Remote telemetry privacy tiers MUST remain an explicit reserved gap
即使本地 observability 支持最小化或关闭，系统也 MUST 继续将 remote analytics / telemetry 的 essential-only、organization-level disable、payload ceiling 与 identity-bound policy 视为 `reserved_gap`，直到仓库真实具备远端 sink 与组织级控制面。

#### Scenario: User compares local observability and remote telemetry controls
- **WHEN** 用户检查 telemetry 相关隐私规避能力
- **THEN** 系统区分“本地 observability 已可最小化”与“远端 telemetry 控制仍未实现”
- **AND** 不把本地关闭能力误写成远端隐私分层已经就绪
