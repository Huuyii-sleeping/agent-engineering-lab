# user-data-governance-surface Specification

## Purpose
TBD - created by archiving change prd-71-user-data-usage-gap-closeout. Update Purpose after archive.
## Requirements
### Requirement: System MUST publish a unified user-data inventory
系统 MUST 提供一份统一的用户数据清单，至少覆盖 `model_input`、`local_persistence`、`memory`、`local_observability`、`remote_ingress`、`optional_remote_egress` 六类数据面，而不是让用户分别翻找 prompt、session、memory、observability 与 bridge 模块。

#### Scenario: User inspects the current data inventory
- **WHEN** 用户查看当前仓库的用户数据治理清单
- **THEN** 系统返回每一类数据面的名称、来源、用途、默认启用状态与保留/导出/删除语义

#### Scenario: Inventory includes current local capabilities
- **WHEN** 当前仓库已经实现 session、transcript、memory、observability 或 bridge 相关能力
- **THEN** 清单中必须显式列出这些能力对应的数据面，而不是因为它们是“本地能力”就省略不写

### Requirement: User-data inventory MUST mark unsupported or reserved surfaces explicitly
统一数据清单 MUST 对当前仓库尚未实现的用户数据面给出显式状态，例如 `待实现`、`未启用` 或 `保留缺口`，而不是通过缺席让用户自行猜测。

#### Scenario: Account or organization data plane is not implemented
- **WHEN** 当前仓库没有完整的 OAuth / account / organization 数据面
- **THEN** 清单中将该能力标记为 `保留缺口`
- **AND** 说明其未在当前仓库产品化，而不是假装已由本地配置或 team 协议替代

#### Scenario: Shared memory or transcript upload is not implemented
- **WHEN** 当前仓库没有 shared team memory sync、transcript 分享或训练改进上传能力
- **THEN** 清单中仍必须列出这些数据面并标记为 `保留缺口`

### Requirement: User-data inventory SHALL separate local-only, remote-ingress, and outbound-consent planes
统一数据清单 SHALL 明确区分默认本地数据面、启用 bridge/remote 后才出现的 ingress 数据面，以及需要显式同意或后续产品面支持的 outbound 数据面，避免把不同风险等级的数据流混为一谈。

#### Scenario: Local-only runtime is inspected
- **WHEN** 用户检查默认本地运行模式下的数据治理状态
- **THEN** 系统明确标识哪些数据面仅发生在本地
- **AND** 不把不存在的 remote export 误标为默认启用

#### Scenario: Bridge or remote mode is active
- **WHEN** bridge 或其他 remote ingress 模式被启用
- **THEN** 系统明确标识这是边界扩大的数据面
- **AND** 将其与本地 observability、local transcript、local memory 分开披露

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

