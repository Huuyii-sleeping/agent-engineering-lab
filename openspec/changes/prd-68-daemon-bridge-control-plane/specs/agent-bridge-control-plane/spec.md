## ADDED Requirements

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
