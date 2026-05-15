## Why

当前仓库已经有本地 daemon、HTTP service、bridge manifest 和多入口 attach/reuse，但这些能力仍更像“可复用的本地 API”，还不是一个稳定的 bridge control plane。尤其是缺少显式 bridge state、事件重放与 reconnect 语义，导致未来无论是更强的本地控制面，还是后续远端入口，都要自己拼装状态判断和事件恢复逻辑。

现在需要把现有 daemon-backed HTTP surface 提升成第一阶段 bridge control plane：先稳定状态查询和事件游标协议，而不是一次性上完整远端平台、鉴权和多端编排。

## What Changes

- 新增 bridge state surface，让调用方能读取当前 bridge/daemon 的可用状态、session 概览和事件游标，而不是只靠 `health + sessions` 自己拼状态。
- 为 host 事件流增加可重放缓冲区和 `since_id` / `Last-Event-ID` 语义，使断线重连方可以补拉历史事件后继续订阅。
- 扩展 bridge client，使其能读取 bridge state，并复用统一的 daemon-backed bridge probe。
- 增加 tests 和 smoke，覆盖 bridge state、event replay 与 daemon-backed bridge 控制链路。

### In Scope

- `AgentHost` 事件缓冲与 replay cursor
- `GET /bridge/state`
- `GET /events` 的 replay / reconnect 语义
- `AgentServiceClient` bridge state 读取
- daemon-backed bridge 的 unit/smoke 验证

### Out of Scope

- 跨机器鉴权 / TLS / 用户身份
- Web UI 或独立 remote dashboard
- 多客户端写冲突协调
- WebSocket 或双向 bridge protocol

## Capabilities

### New Capabilities

- `agent-bridge-control-plane`: 定义 bridge state、事件重放与 reconnect 语义

### Modified Capabilities

- `agent-host-daemon-runtime`: daemon-backed host 不只提供 attach/reuse，还要提供稳定 bridge control plane 基础语义

## Impact

- 影响代码：`apps/agent-cli/src/host/*`、`apps/agent-cli/src/service-api/*`
- 影响测试：service-api / daemon / smoke tests
- 影响文档：`apps/agent-cli/README.md`、OpenSpec 主 specs
