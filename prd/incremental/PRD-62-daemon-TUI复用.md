# PRD-62 daemon TUI 复用

## 背景

`PRD-60` 已经让 `agent-cli daemon` 成为真实后台宿主，`PRD-61` 又补了 `daemon status` 探测。但 `agent-cli tui` 仍然默认在当前进程内重新创建一套 runtime，尚未真正复用已存在的 daemon。

这导致 daemon 虽然“存在”，前台交互却没有真正 attach 到共享宿主，session、工具调用和长期状态也没有合流。

## 目标

- 让 `agent-cli tui` 在 daemon 可用时优先 attach 到共享宿主。
- 保持 daemon 不可用时的 embedded fallback。
- 通过共享 service client 收敛 attach 逻辑，不把 HTTP 调用散落在 TUI 主循环中。

## In Scope

- daemon-backed TUI attach / reuse
- 共享 service client
- TUI 所需的远端 chat / session / tool call 面
- README、测试和 OpenSpec 同步

## Out of Scope

- 交互式 CLI attach
- daemon stop / restart
- WebSocket 或跨机器控制面

## 验收标准

- `agent-cli tui` 在运行中 daemon 存在且 service ready 时优先 attach。
- attach 后 TUI 能读取共享 sessions，并继续使用 chat 与常用本地工具表面。
- daemon 不可用或 attach 失败时，TUI 会自动回退 embedded 模式。
- 相关 focused tests、build 和 OpenSpec strict 通过。
