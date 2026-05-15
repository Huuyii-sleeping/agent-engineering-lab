## Context

当前 daemon attach 已经覆盖了：

- daemon status 探测
- daemon-backed TUI reuse
- host-owned shared event stream

但 `mcp-server` 入口仍然是 embedded-first，这与当前项目“多入口共享宿主”的方向不一致。另一方面，TUI 里的 daemon attach 逻辑也还停留在入口内联状态，缺少一个共享 resolver。

## Goals / Non-Goals

**Goals:**

- 抽取共享 daemon service client resolver，减少入口层重复逻辑。
- 让 `agent-cli mcp-server` 在 daemon 可用时优先 attach 到共享宿主。
- 保留 embedded fallback，避免 daemon 不可用时破坏 MCP 入口基本能力。

**Non-Goals:**

- 不新增新的 MCP tool 能力。
- 不实现交互式 CLI attach。
- 不修改 daemon HTTP 协议结构，除非为 client surface 补最小缺口。

## Decisions

### Decision 1: 将 daemon 探测与 client 初始化抽成共享 resolver

- 方案 A：继续让 TUI / MCP 各自内联 `DaemonLock + AgentServiceClient.initialize()`
- 方案 B：抽成共享 resolver，由入口只决定“attach 成功后的 UI / stderr 提示”

选择：方案 B。

原因：

- daemon attach 逻辑已经从单一 TUI 路径扩展到多入口复用，继续复制会让边界再次散乱。
- resolver 是典型的“宿主接入层”逻辑，适合作为共享模块沉淀。

### Decision 2: MCP 入口沿用 awaitable service surface，而不是为远端 attach 设计额外适配层

- 方案 A：保持 `createSession()` / `getSessionDetail()` 全同步，单独为远端做临时包装
- 方案 B：允许 MCP service surface 接受 awaitable create/detail 结果，handler 统一 `await`

选择：方案 B。

原因：

- 远端 attach 下，这两个动作都天然可能触发 HTTP round trip。
- MCP handler 本身已经是 async 流程，接受 awaitable 的回归成本很小。

## Risks / Trade-offs

- [Risk] daemon attach 失败后静默回退，调用方可能误以为当前一定在复用共享宿主
  - Mitigation：对 TUI 保留提示文案；MCP 入口不强调文案，但保持 fallback 一致

- [Risk] client surface 继续扩展，可能把 `AgentServiceClient` 做得过重
  - Mitigation：只补 MCP 入口当前需要的最小接口，不把它做成通用 SDK

## Migration Plan

1. 新增 `PRD-64` proposal / design / delta spec。
2. 抽取共享 daemon resolver，并为 client 补 session detail 读取面。
3. 让 `mcp-server` 优先 attach daemon，失败时回退 embedded。
4. 补 focused tests、README、OpenSpec strict。
