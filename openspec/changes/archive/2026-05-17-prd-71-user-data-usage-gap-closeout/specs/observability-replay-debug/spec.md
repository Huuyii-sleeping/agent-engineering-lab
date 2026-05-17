## ADDED Requirements

### Requirement: Telemetry governance MUST distinguish local observability from remote analytics
observability 与 telemetry 相关 surface MUST 明确区分当前本地 observability 数据面，与未来可能存在的 remote analytics / export 数据面，避免把二者混为一个默认启用的能力。

#### Scenario: Local observability is inspected
- **WHEN** 用户检查 observability / telemetry 数据治理信息
- **THEN** 系统明确标识当前本地事件、指标与 replay 数据面属于本地 observability
- **AND** 说明这些数据默认不等于远端 analytics 上传

#### Scenario: Remote analytics is not implemented
- **WHEN** 当前仓库没有 remote analytics sink 或组织级 telemetry 上报能力
- **THEN** 系统将对应数据面标记为 `保留缺口`、`未启用` 或等价状态
- **AND** 不把本地 `.observability` 误描述成远端遥测产品面
