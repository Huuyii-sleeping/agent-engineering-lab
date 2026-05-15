## Context

当前 `agent-cli` 的 daemon 已经具备：

- 长期 `AgentHost`
- session persistence
- 单实例锁与 `daemon status`
- 基于 HTTP / SSE 的 service API

但 `agent-cli tui` 仍然默认直接在当前进程里创建 `AgentService`。这意味着后台 daemon 虽然存在，前台却没有真正 attach 到它，session、工具调用和长期宿主状态仍然是分裂的。

这一步的目标不是把所有入口都改成 remote-first，而是先把最适合接 service abstraction 的 TUI 接到 daemon 上，验证“共享宿主 + 前台 attach”这条路是稳定的。

## Goals / Non-Goals

**Goals:**

- 提供一个可复用的 daemon-backed service client，复用现有 HTTP service API。
- 让 `agent-cli tui` 在 daemon 可用时优先 attach 到共享宿主。
- 保留 embedded fallback，避免 daemon 不可用时破坏当前本地体验。
- 尽量复用现有 TUI command / service 抽象，而不是重写 TUI 主循环。

**Non-Goals:**

- 不实现交互式 CLI attach。
- 不引入 WebSocket 或新的长连接协议。
- 不改造 daemon 生命周期管理为 stop / restart / upgrade 控制面。
- 不改变 session persistence 的存储格式。

## Decisions

### Decision 1: attach 第一阶段复用现有 HTTP service API，并只补最小缺口

- 方案 A：为 attach 单独引入新的协议层或 WebSocket 面
- 方案 B：基于现有 `/health`、`/bridge`、`/sessions`、`/chat` 扩展一个最小远端工具调用面，并提供共享 client

选择：方案 B。

原因：

- 当前 daemon 已经有稳定的本地 HTTP service API，直接复用成本最低。
- 这一步的目标是“让前台能复用 daemon”，不是重新设计协议。
- 补一个最小 tool-call 面，就能把 TUI 现有的 shell / approvals 等能力继续挂在同一套 service abstraction 上。

不选方案 A 的原因：

- 会把增量从 attach/reuse 扩大到协议重设计，收益和复杂度不匹配。

### Decision 2: 为 TUI 引入缓存型 daemon service client，而不是把 TUI 全量改成细粒度异步远端读取

- 方案 A：在 TUI 内部按需分散发 HTTP 请求
- 方案 B：引入集中式 client，启动时 hydrate session cache，对外继续暴露 TUI 兼容的 service 形状

选择：方案 B。

原因：

- 现有 TUI 大量依赖同步 `listSessions()` 和本地 transcript 浏览。
- 通过集中式 client 维护会话快照，可以最小化对 TUI 主循环和 palette / transcript 逻辑的扰动。
- 以后如果 MCP server 或其他前台入口要 attach，也可以复用同一 client 思路。

不选方案 A 的原因：

- 会把远端调用散落到 TUI 各处，边界更差，回归风险更高。

### Decision 3: TUI 只在“lock 显示 running 且 HTTP ready probe 成功”时 attach，否则回退 embedded

- 方案 A：只看 lock file，发现 daemon 就强行 attach
- 方案 B：用 `daemon status` 语义做第一层存在性判断，再用 `/health` / `/bridge` 确认服务真的可用；任何失败都回退 embedded
- 方案 C：要求用户显式传 `--daemon` 才 attach

选择：方案 B。

原因：

- `daemon status` 已经是当前本地真相源，适合做第一层快速探测。
- 仅看 lock 可能遇到 daemon 进程存在但 HTTP 尚未 ready 的短时窗口。
- 自动 attach + 安全回退，最符合“优先复用但不破坏现有体验”的目标。

不选方案 A 的原因：

- 对 ready 状态过于乐观，容易把 attach 失败直接暴露给用户。

不选方案 C 的原因：

- 会让“复用已存在 daemon”继续停留在手动模式，平台化收益打折。

### Decision 4: 将 `createSession()` 调整为 awaitable，而不是继续强行保持纯同步约束

- 方案 A：继续要求 service `createSession()` 同步返回
- 方案 B：允许 service `createSession()` 返回 sync-or-async 结果，调用方统一 `await`

选择：方案 B。

原因：

- 远端 attach 下，创建 session 天然需要一次服务调用。
- 现有 command dispatcher 已经是 async 流程，接受 awaitable 改动很小。
- 这样可以兼容本地 `AgentService` 的同步实现和远端 client 的异步实现。

不选方案 A 的原因：

- 会把远端 attach 压成非常别扭的预创建或隐式副作用逻辑，接口反而更差。

## Risks / Trade-offs

- [Risk] daemon client 的 session cache 可能短时落后于服务端状态
  - Mitigation：启动时 hydrate 全量 session，chat / createSession 后主动刷新目标 session

- [Risk] attach 失败后自动 fallback，用户可能没意识到当前并未连到 daemon
  - Mitigation：在 TUI 初始提示中明确写出 attached / fallback 状态

- [Risk] 增加远端 tool-call 面会扩大本地 HTTP service 暴露范围
  - Mitigation：仅暴露当前 TUI 复用所需的最小封装，仍复用现有 tool service 权限与执行链路

## Migration Plan

1. 新增 `PRD-62` proposal / design / delta spec。
2. 为 service API 增加共享端口 helper、远端 tool-call 路由和 client。
3. 让 TUI 默认先尝试 attach 到 running daemon，失败时回退 embedded host。
4. 补 focused tests、README、OpenSpec strict。

回滚策略：

- 如果 daemon-backed TUI 不稳定，可回退到纯 embedded TUI 路径，同时保留 daemon status 和 daemon host 基础设施。

## Open Questions

- 交互式 CLI 是否也应沿用同一 client 路径 attach 到 daemon，还是保持本地 runtime 优先。
