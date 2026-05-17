# privacy-minimization-controls Specification

## Purpose
TBD - created by archiving change prd-72-privacy-avoidance-gap-closeout. Update Purpose after archive.
## Requirements
### Requirement: Runtime SHALL expose a unified privacy minimization control contract
系统 SHALL 提供统一的隐私规避控制 contract，至少覆盖 `persistence`、`memory`、`observability`、`remote_attach`、`external_capabilities` 五类数据相关默认行为，而不是让用户分别到 retention、daemon、memory 与 MCP 模块中自行拼装实际隐私姿态。

#### Scenario: User inspects privacy minimization posture
- **WHEN** 用户检查当前运行时的隐私规避状态
- **THEN** 系统返回五类控制面的当前姿态
- **AND** 明确区分哪些控制已实现、哪些仅为保留缺口

### Requirement: Privacy minimization controls MUST be locally enforceable without account dependencies
当前仓库中的隐私规避控制 MUST 可以在本地运行时直接生效，不得依赖尚未存在的 account、organization、subscription 或远端 policy plane 才能启用。

#### Scenario: Local runtime enables privacy minimization
- **WHEN** 用户在当前本地运行时启用任一隐私规避控制
- **THEN** 系统在本地直接改变对应默认行为
- **AND** 不要求用户先接入远端身份或组织配置

### Requirement: Unimplemented cloud and organization privacy controls MUST remain reserved gaps
对于 remote telemetry privacy tiers、organization-level disable、identity-bound privacy policy、shared team memory sync、training-improvement uploads 等当前仓库不具备的能力，系统 MUST 在统一控制面中显式标记为 `reserved_gap`，而不是用本地近似能力伪装为已支持。

#### Scenario: User inspects unavailable remote privacy controls
- **WHEN** 用户检查远端或组织级隐私规避能力
- **THEN** 系统将这些能力标记为 `reserved_gap`
- **AND** 说明当前仓库尚无真实产品面或执行平面

