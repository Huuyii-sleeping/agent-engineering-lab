## Why

默认 CLI 已切换到 Ink/TSX surface，但该入口缺少旧 readline CLI 的 scheduler loop。用户创建 `schedule_create` 后，任务会进入调度队列，却不会在当前 Ink CLI 中主动触发并渲染提醒。

## What Changes

- Ink/TSX CLI 组件支持异步 scheduled tick 消息追加。
- Ink 入口新增 runtime controller，统一处理用户输入和 scheduled tick。
- Embedded runtime 路径复用现有 `runScheduledRound`。
- Daemon-backed service 路径本地 tick scheduler 后通过 `service.chat()` 让 daemon 处理 due prompt。
- 新增单元测试覆盖 embedded 和 daemon 两条 scheduler 主动提醒路径。

## Impact

- 影响代码：`apps/agent-cli/src/entrypoints/tui-ink.tsx`、`apps/agent-cli/src/terminal-ui/ink-tui.tsx`。
- 影响测试：新增 `apps/agent-cli/test/unit/entrypoints/tui-ink.test.ts`。
