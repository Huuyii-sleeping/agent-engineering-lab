## Why

参考 Claude Code session storage / resume 分析，本仓库虽然已有 `.sessions/session_<id>.json` 快照式持久化和跨宿主恢复，但缺少 append-only transcript/journal 事实源。覆盖式 JSON 在可审计性、恢复韧性和后续轻量 resume 读取方面都偏弱，继续扩展 session 能力前需要先补齐本地日志底座。

## What Changes

In Scope:

- 为每个 service session 增加 append-only JSONL journal，记录 session 生命周期与保存事件。
- `SessionStore` 恢复时优先从 journal 重建最新 session，journal 不存在或不可读时兼容旧 JSON 快照。
- 保持现有 `.sessions/session_<id>.json` 快照输出，避免破坏现有 API 和测试。
- 删除 session 时同步清理快照与 journal。
- 补充定向单元测试和 smoke 测试，覆盖 journal 写入、journal 恢复、旧快照兼容和删除清理。

Out of Scope:

- 不实现远端 ingress、云同步或跨设备 resume。
- 不实现完整 sidechain transcript、fork 修复或外部会话图。
- 不改变 HTTP `/sessions`、`/sessions/:id`、`/chat` 响应 shape。
- 不改造 `.transcripts/` compact snapshot。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-service-sessions`: session 持久化需要具备 append-only journal 事实源，并从 journal 恢复最新 session。
- `local-data-retention-controls`: session 删除和 no-persistence 语义需要覆盖 session journal。

## Impact

- 影响 `apps/agent-cli/src/service-api/session-store.ts`。
- 影响 `apps/agent-cli/test/unit/service-api/session-store.test.ts`。
- 新增或更新 `apps/agent-cli/test/smoke/` 下的 PRD-75 smoke。
- 影响 OpenSpec 主规范 `agent-service-sessions` 与 `local-data-retention-controls`。
