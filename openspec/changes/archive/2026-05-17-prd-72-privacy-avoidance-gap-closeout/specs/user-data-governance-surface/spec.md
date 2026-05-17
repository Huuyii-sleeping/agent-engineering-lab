## ADDED Requirements

### Requirement: Governance surface MUST disclose effective privacy minimization posture
统一用户数据治理面 MUST 不仅披露数据类别，还要披露当前运行时在 `persistence`、`memory`、`observability`、`remote_attach`、`external_capabilities` 五类控制面上的实际姿态，使用户可以直接判断“哪些数据默认被减少、阻断或仍然开启”。

#### Scenario: User inspects the active privacy posture
- **WHEN** 用户查看统一治理信息
- **THEN** 系统返回五类控制面的当前状态
- **AND** 说明每类状态对应阻断或缩减了哪些数据面

### Requirement: Governance surface MUST enumerate unimplemented privacy avoidance gaps
统一治理面 MUST 将当前仓库尚未具备的隐私规避能力显式列为缺口，至少包括 remote telemetry privacy tiers、organization policy sync、shared team memory sync、transcript share 与 training-improvement uploads，而不是把这些面留白。

#### Scenario: User inspects unavailable privacy controls
- **WHEN** 用户检查仓库尚未实现的隐私规避能力
- **THEN** 系统按 `reserved_gap` 或等价状态列出这些能力
- **AND** 说明缺失的是产品面、控制面还是远端执行面
