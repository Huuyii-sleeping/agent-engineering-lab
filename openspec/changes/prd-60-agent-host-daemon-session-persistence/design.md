## Context

当前 `agent-cli` 已经形成较完整的本地运行时能力，但装配方式仍偏向“入口启动一套 runtime，执行完即退出”。这导致几个问题：

- CLI、TUI、HTTP、MCP 虽然共享大量代码，但缺少一个长期存在的宿主对象来统一承载 session、事件和生命周期。
- session 主要依赖进程内内存，重启后难以恢复，不利于长期使用。
- 后续如果要引入工具并发调度、插件运行时或更强的控制面，缺少稳定的底座。

本次变更只解决本地平台底座问题，不扩展到远程 swarm、WebSocket 或插件系统。目标是先把 `agent-cli` 从“可运行的本地 Agent”推进到“可驻留、可恢复、可多入口共享”的本地 Agent 平台。

## Goals / Non-Goals

**Goals:**

- 引入长期宿主 `AgentHost`，统一承载 runtime services、query engine、session registry 和事件流。
- 新增 `daemon` 入口，使 `agent-cli` 可以作为后台进程长期运行。
- 为 service API 引入 session 持久化能力，使 session 可在重启后恢复。
- 让 CLI / TUI / HTTP / MCP 的运行时装配逐步收敛到共享 host。

**Non-Goals:**

- 不实现远程 orchestrator、swarm backend 或 WebSocket reconnect。
- 不实现工具并发调度或 batch API。
- 不引入完整 plugin runtime。
- 不改变现有 chat、tool、session summary 的业务语义，只调整承载方式和恢复能力。

## Decisions

### 决策 1：先引入进程内 `AgentHost`，再通过 daemon 暴露长期宿主

- 方案 A：直接在现有 `AgentService` 内继续堆 session、event 和 lifecycle 逻辑
- 方案 B：新增独立 `AgentHost`，由 `AgentService` 和各入口依赖它

选择：方案 B。

原因：

- `AgentService` 主要是 service API / HTTP surface，继续堆积宿主职责会让边界再次混乱。
- `AgentHost` 更适合作为 CLI、TUI、HTTP、MCP 的共同依赖，也更符合“先有宿主，再有入口”的平台分层。

不选方案 A 的原因：

- 会把 service surface 和 runtime host 混在一起，后续引入 attach / detach 和 daemon 生命周期会更难拆。

### 决策 2：session persistence 第一阶段采用文件持久化，而不是数据库

- 方案 A：直接引入 SQLite 等嵌入式数据库
- 方案 B：使用 `.sessions/` 目录下的 JSON 文件持久化

选择：方案 B。

原因：

- 当前需求是“本地恢复”和“长期驻留”，不是高并发或复杂查询。
- 文件持久化可以快速验证宿主和恢复模型，避免为第一阶段引入额外依赖和迁移成本。

不选方案 A 的原因：

- 会把第一阶段复杂度从宿主架构问题扩大到存储选型和 schema migration。

### 决策 3：daemon 第一阶段复用现有 HTTP / SSE 能力，不额外引入 WebSocket

- 方案 A：先上 WebSocket 作为 attach 面
- 方案 B：先复用现有 HTTP session API 和 `/events` 事件流

选择：方案 B。

原因：

- 当前仓库已经有 service API、bridge manifest 和事件流能力，复用成本最低。
- 第一阶段重点是稳定长期宿主，而不是追求最丰富的前端交互协议。

不选方案 A 的原因：

- 会把问题提前扩展到连接管理、重连语义和前端协议适配。

### 决策 4：多入口共享宿主采用“嵌入式 host + daemon mode”双模式

- 方案 A：所有入口都必须先 attach 到 daemon
- 方案 B：保留当前单进程嵌入式运行方式，同时新增 daemon mode

选择：方案 B。

原因：

- 不破坏当前本地开发体验。
- 可以逐步让 TUI / HTTP / MCP 先共享 host，再视需要演进到显式 attach。

不选方案 A 的原因：

- 会把一次架构演进变成强制使用方式切换，迁移成本过高。

## Risks / Trade-offs

- [Risk] `AgentHost` 与 `AgentService` 职责分界不清 → Mitigation：明确 `AgentHost` 负责 runtime/session lifecycle，`AgentService` 只负责 API surface 和 request adaptation。
- [Risk] 文件持久化的 session 在异常中断时写入不完整 → Mitigation：采用原子写入策略，先写临时文件再替换。
- [Risk] 入口逐步接入共享 host 时出现行为不一致 → Mitigation：保留现有 smoke / unit 测试语义，优先给 session、daemon 和 service API 增补回归测试。
- [Trade-off] 第一阶段不做 WebSocket 和插件系统，平台能力看起来还不够“完整” → Mitigation：先稳定底座，再在后续变更中演进控制面和扩展体系。

## Migration Plan

1. 先新增 `AgentHost` 和 session store，不修改既有外部接口语义。
2. 新增 `daemon` 入口，并让其承载长期 `AgentHost`。
3. 将 `AgentService` 调整为依赖共享 host，而不是自行持有分散状态。
4. 优先让 HTTP / MCP / TUI 装配走 host，CLI 保持兼容。
5. 通过 unit / smoke 验证回归后再继续下一个增量。

回滚策略：

- 如果 `AgentHost` 引入导致行为不稳定，可以回退到当前嵌入式 runtime 组装方式。
- 如果 session persistence 不稳定，可以暂时退回内存 session，同时保留 host 抽象。

## Open Questions

- daemon 第一阶段是否需要独立 pid / lock 文件来防止重复启动。
- CLI 交互模式是否在第一阶段就支持 attach 到已有 daemon，还是先只提供 daemon 入口和 HTTP/MCP 共享宿主。
- session 持久化是否需要记录完整 tool 输出，还是只保留恢复对话所需的最小历史。
