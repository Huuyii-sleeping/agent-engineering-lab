## ADDED Requirements

### Requirement: Bridge surfaces MUST disclose expanded ingress boundaries
bridge 或等价 remote ingress surface MUST 明确披露启用后新增会接触的数据类别，至少包括远端会话标识、bridge state、event replay cursor、session ingress metadata 与其他因 attach/replay 扩大的边界。

#### Scenario: User inspects bridge boundary
- **WHEN** 用户检查 bridge 或 remote ingress 的数据治理信息
- **THEN** 系统列出启用该模式后新增的数据类别及其用途
- **AND** 明确这些数据面不属于默认本地模式的最小边界

#### Scenario: Bridge mode is inactive
- **WHEN** 当前运行模式未启用 bridge 或 remote ingress
- **THEN** 系统将对应数据面标记为未激活或按需启用
- **AND** 不把 remote 边界扩大误写成本地默认行为
