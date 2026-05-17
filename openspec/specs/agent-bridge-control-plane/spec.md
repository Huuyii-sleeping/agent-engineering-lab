# agent-bridge-control-plane Specification

## Purpose
定义 agent bridge 的第一阶段控制面契约，使调用方可以稳定读取 bridge 状态，并在同一宿主存活期内基于事件 cursor 进行重放和断线恢复。
## Requirements
### Requirement: Agent bridge SHALL expose an explicit bridge state surface
系统 SHALL 提供显式 bridge state surface，使调用方能够在一次请求中读取 bridge 当前状态，而不是自行拼装多个 endpoint。

#### Scenario: 读取 bridge state
- **WHEN** 调用方请求 `GET /bridge/state`
- **THEN** 系统返回 bridge readiness、manifest capabilities、session 概览和最新事件游标

### Requirement: Agent bridge events SHALL support replay from a cursor
系统 SHALL 支持从宿主级事件游标重放 bridge events，使断线调用方可以恢复最近事件流，而不是只能重新订阅实时流。

#### Scenario: 使用 since_id 重放事件
- **WHEN** 调用方请求 `GET /events?since_id=<id>`
- **THEN** 系统先返回该游标之后仍在缓冲区中的历史事件
- **AND** 再继续返回后续实时事件

#### Scenario: 使用 Last-Event-ID 重放事件
- **WHEN** 调用方以 `Last-Event-ID` header 重新订阅 `/events`
- **THEN** 系统按该游标之后的事件继续重放并恢复实时订阅

### Requirement: Bridge event cursors SHALL be host-scoped and monotonic
bridge event cursor MUST 由共享宿主统一分配，并在同一宿主存活期内保持单调递增。

#### Scenario: 多个入口共享同一事件游标空间
- **WHEN** 两个或更多 surface 复用同一个 `AgentHost`
- **THEN** 它们观测到的 bridge event id 来自同一单调递增序列
- **AND** replay cursor 语义不按单个 service instance 分裂

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

