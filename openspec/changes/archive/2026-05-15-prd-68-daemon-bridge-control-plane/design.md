## Context

当前 bridge 基础能力已经存在：

- `AgentService` 暴露 `/health`、`/bridge`、`/sessions`、`/chat`、`/tools`、`/events`
- `AgentHost` 维护共享 session 和宿主级事件流
- `AgentServiceClient` 已能 attach 并加载 bridge manifest / sessions
- CLI / TUI / MCP 已经能在 daemon 存在时 attach 到共享 host

但 bridge 还缺三类稳定契约：

1. 缺少显式 bridge state：调用方无法一次性拿到 `ready / session_count / latest_event_id / capabilities`
2. 缺少可重放事件缓冲：`/events` 只支持实时 SSE，不支持断线后从某个 cursor 恢复
3. 缺少 bridge client 的统一状态读取：attach/resolver 仍主要围绕 `health + bridge + sessions` 手工组合

## Goals / Non-Goals

**Goals:**

- 定义 bridge control plane 第一阶段的稳定 HTTP 协议
- 让 `AgentHost` 提供宿主级事件 replay 缓冲，而不是只支持“当场订阅”
- 让 future caller 能通过 bridge state + event cursor 构建 reconnect 逻辑

**Non-Goals:**

- 不引入 WebSocket
- 不引入认证/授权协议
- 不改变现有 CLI/TUI/MCP 的基本 attach 流程

## Decisions

### 1. 新增显式 `/bridge/state`，而不是继续让调用方拼多个 endpoint

决策：

- `GET /bridge/state` 返回 bridge 可用状态、session 概览、最新事件游标和 manifest 中的 capabilities。

原因：

- 未来任何 bridge caller 都需要这类信息；如果继续让调用方分别访问 `/health`、`/bridge`、`/sessions`，状态解释会继续散落在 client 侧。

备选方案：

- 继续只保留 `/health` + `/bridge` + `/sessions`
- 不采用原因：调用方需要自行同步三段信息，容易出现状态判断漂移。

### 2. 在 `AgentHost` 内维护有限事件缓冲，而不是让每个 surface 自己缓存

决策：

- `AgentHost` 维护宿主级 ring buffer，保存最近一段 `AgentHostEvent`
- `/events` 在新订阅建立时先回放 `since_id` 之后的事件，再继续实时订阅

原因：

- 事件属于宿主层事实，不应该由某个 HTTP service surface 自己缓存
- replay cursor 的权威来源必须与 event id 生成位置一致

备选方案：

- 在 `service-api/index.ts` 单独维护 HTTP 层事件缓存
- 不采用原因：会让事件事实源分叉，未来 MCP / 其他 surface 无法共享同一 replay 语义

### 3. 采用 SSE + cursor 重放，而不是现在就上双向协议

决策：

- 继续使用现有 SSE `/events`
- 新增 `since_id` query 和 `Last-Event-ID` header 支持
- 不新增双向 channel

原因：

- 当前 bridge 最大缺口不是“不能双向通信”，而是“状态和事件恢复不稳定”
- SSE replay 是对现有实现的增量强化，改动最小、收益直接

备选方案：

- 直接切 WebSocket 或自定义 bridge session
- 不采用原因：会明显扩大协议面和测试面，超出第一阶段范围

## Risks / Trade-offs

- [Risk] 事件缓冲只存在内存中，daemon 重启后 cursor 无法跨进程恢复。
  → Mitigation：第一阶段明确只承诺“同一宿主存活期内的 replay”，跨重启恢复留给后续阶段。

- [Risk] replay 缓冲过大可能带来内存膨胀。
  → Mitigation：使用有限 ring buffer，并在 bridge state 中暴露最新 event id，而不是承诺无限历史。

- [Risk] 未来如果引入认证，bridge client 初始化路径还会再改一次。
  → Mitigation：先把 state / replay 协议稳定下来，认证作为独立后续变更叠加在 transport 层。
