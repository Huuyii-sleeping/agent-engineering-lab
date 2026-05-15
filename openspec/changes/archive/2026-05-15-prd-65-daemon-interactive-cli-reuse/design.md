## Context

当前 daemon attach 已经覆盖了：

- `agent-cli daemon status`
- `agent-cli tui`
- `agent-cli mcp-server`
- 宿主级共享事件流与 session persistence

但默认交互 CLI `agent-cli` 仍然只使用进程内的 `createAgentAppRuntime()`、本地 session map 和本地 chat 主链路。结果是最常用的入口反而没有接入共享宿主，这让 daemon 平台化只完成了“部分入口复用”。

interactive CLI 和 TUI 不同，它不仅要聊天，还承载大量本地 slash command、palette、completion、transcript 浏览和 shell shortcut。因此这一步不能简单把主循环改成散落的 HTTP 调用，而要先定义稳定的适配边界。

## Goals / Non-Goals

**Goals:**

- 让默认交互 CLI 在 daemon 可用时优先 attach 到共享宿主。
- 为 interactive CLI 提供兼容现有命令分发的 daemon-backed service/session 适配层。
- 保留 embedded fallback，避免 daemon 不可用时破坏当前默认入口体验。
- 尽量复用现有 `AgentServiceClient`、daemon resolver 和 service API，而不是新增协议。

**Non-Goals:**

- 不在本轮把所有本地 CLI 命令都改造成远端 RPC。
- 不新增新的 daemon 控制命令，如 `stop`、`restart`、`upgrade`。
- 不引入 WebSocket、消息总线或新的事件传输层。
- 不改动 session persistence 的磁盘格式。

## Decisions

### Decision 1: 默认交互 CLI 采用 attach-first、embedded-fallback 启动策略

- 方案 A：保持 interactive CLI 永远 embedded，本轮不接 daemon
- 方案 B：默认先探测 daemon，attach 成功则复用共享宿主，否则回退 embedded
- 方案 C：要求用户显式传新参数才 attach daemon

选择：方案 B。

原因：

- 默认入口是最常用入口，不接 daemon 会让平台化收益长期打折。
- 当前已经有 `daemon status` 与共享 resolver，自动 attach 的基础条件已具备。
- 自动 attach + 安全回退，可以同时满足“优先复用”和“不破坏现有体验”。

不选方案 A 的原因：

- 会让共享宿主只覆盖次级入口，架构上继续不完整。

不选方案 C 的原因：

- 会把共享宿主变成 opt-in 能力，而不是默认运行时语义。

### Decision 2: 为 interactive CLI 引入统一适配层，而不是在主循环里散布远端 HTTP 调用

- 方案 A：在 `cli/index.ts` 内直接按需调用 `AgentServiceClient`
- 方案 B：抽象一层 CLI runtime adapter，对外暴露 `createSession`、`listSessions`、`chat`、`tools`、`status` 等交互所需能力

选择：方案 B。

原因：

- interactive CLI 当前命令面很多，直接散布 HTTP 调用会让边界比改造前更差。
- 适配层可以同时容纳 embedded host 与 daemon client，两条路径共用命令分发逻辑。
- 后续如果要让更多 CLI 命令复用 daemon，也有清晰扩展点。

不选方案 A 的原因：

- `cli/index.ts` 已经很重，再把远端调用散进去会显著提高回归风险。

### Decision 3: 本轮只把共享宿主主链路远端化，本地增强命令继续按能力分层处理

- 方案 A：要求 interactive CLI 所有命令都在 daemon attach 下完全远端等价
- 方案 B：优先远端化 session/chat/tool metadata 等主链路；对强依赖本地 runtime 或本地终端状态的命令继续保留本地实现，必要时走 embedded fallback

选择：方案 B。

原因：

- 当前 CLI 有 `/model`、`/doctor`、palette、completion、shell shortcut 等明显不同类别的命令。
- 一次追求“所有命令远端完全等价”会把范围从 attach/reuse 扩大成 CLI 全面重构。
- 主链路先复用 daemon，已经能解决 session 分裂和宿主不共享的核心问题。

不选方案 A 的原因：

- 改动面过大，和本轮“小步平台化”目标不匹配。

### Decision 4: daemon-backed interactive CLI 继续复用现有 HTTP service API，只补最小 client surface

- 方案 A：为 interactive CLI 单独加新协议或专用 daemon API
- 方案 B：沿用 `/health`、`/bridge`、`/sessions`、`/chat`、`/tools`，只在 client 或 service surface 上补当前缺口

选择：方案 B。

原因：

- 已有 TUI / MCP attach 经验表明当前 service API 足够承载第一阶段共享宿主。
- 重用同一套协议，有利于让 interactive CLI、TUI、MCP 真正共享接入模型。

不选方案 A 的原因：

- 会引入没有必要的协议分叉，增加后续维护成本。

## Risks / Trade-offs

- [Risk] interactive CLI 的本地 session 状态与 daemon session 快照可能短时不一致
  - Mitigation：attach 时 hydrate daemon session 列表，创建 session 与 chat 后刷新目标 session，并让本地 UI store 只持有会话 id 与临时 UI 状态

- [Risk] 部分本地命令在 daemon attach 下的语义可能不够直观
  - Mitigation：在 design 和 README 中明确哪些命令复用 daemon，哪些命令仍是本地终端能力

- [Risk] attach 失败自动回退后，用户可能不知道当前并未连到 daemon
  - Mitigation：interactive CLI 启动 banner 或首次提示中明确 attached / fallback 状态

- [Risk] 抽适配层后，CLI 命令上下文接口会进一步扩张
  - Mitigation：只抽共享宿主主链路所需最小接口，不借机重做所有命令模型

## Migration Plan

1. 新增 `PRD-65` proposal / design / delta spec。
2. 为 interactive CLI 提炼 daemon-aware adapter，并接入共享 daemon resolver。
3. 让默认 `agent-cli` 优先 attach daemon，失败时回退 embedded。
4. 补 focused tests、README 和架构沉淀。

回滚策略：

- 如果 daemon-backed interactive CLI 不稳定，可回退到纯 embedded CLI 路径，同时保留现有 daemon、TUI 和 MCP 复用能力。

## Open Questions

- `/model` 在 daemon attach 下应只影响当前前台显示，还是允许通过共享宿主切换远端模型配置。
- 某些强依赖本地 runtime 的命令，是应在 attach 模式下继续本地执行，还是显式提示“需要 embedded 模式”。
