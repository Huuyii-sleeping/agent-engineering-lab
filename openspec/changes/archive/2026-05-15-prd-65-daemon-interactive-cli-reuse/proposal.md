## Why

当前 `agent-cli` 默认交互 CLI 仍然只运行本地 embedded runtime，而 `tui` 与 `mcp-server` 已经可以优先复用运行中的 daemon。这个差异会让默认入口与共享宿主割裂，导致 session、事件流、状态探测和长期运行语义仍然分叉。

现在补齐 interactive CLI 的 daemon attach / reuse，是当前这轮本地平台化最自然也最有收益的收口动作。完成后，`agent-cli`、`agent-cli tui` 与 `agent-cli mcp-server` 将共享同一套后台宿主策略，而不是只有部分入口进入 daemon 模式。

## What Changes

### In Scope

- 让默认交互 CLI 在启动时优先探测本地 daemon，并通过共享 daemon client resolver attach 到已有宿主。
- 为 interactive CLI 增加 daemon-backed 会话与聊天适配层，使 `/new`、`/use`、聊天主链路和基础状态读取能够复用共享 session / chat surface。
- 保留现有本地命令体验，包括 slash command、palette、completion 和 shell shortcut；对必须依赖本地运行时的命令，明确 embedded fallback 或本地执行边界。
- 明确 daemon 不可复用、健康检查失败或远端能力不足时的回退语义，保证 interactive CLI 仍可在当前进程内继续工作。

### Out of Scope

- 不引入 Web console、scheduler、plugin runtime 或新的远程控制前端。
- 不在本轮重写 interactive CLI 的全部命令实现，只补齐共享宿主主链路与必要适配面。
- 不引入 WebSocket 或新的 daemon 传输协议，继续沿用当前 HTTP service / client 路径。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `production-runtime-architecture`: 默认交互 CLI 也需要进入共享 host / daemon deployment 模型，并复用统一 daemon client attach 路径。
- `agent-host-daemon-runtime`: daemon attach / fallback 语义从 TUI、MCP 扩展到 interactive CLI，补齐前台入口共享宿主策略。

## Impact

- 受影响代码主要在 `apps/agent-cli/src/cli/`、`apps/agent-cli/src/entrypoints/cli-dispatcher.ts`、`apps/agent-cli/src/service-api/daemon-client.ts` 与相关 service client 适配层。
- 需要补单测，覆盖 interactive CLI attach、session 复用、fallback 和本地命令兼容行为。
- README、架构沉淀和交接文档需要同步 interactive CLI 的 daemon 复用语义。
