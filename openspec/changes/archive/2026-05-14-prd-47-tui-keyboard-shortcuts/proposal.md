## Why

TUI 现在已经有不错的控制面，但高频动作仍然主要依赖 slash command。对于会话切换、屏幕重绘、草稿取消这类纯本地动作，仍然要先打字再回车，交互阻力偏高。

## What Changes

- 为 TUI 增加安全、轻量的键盘快捷键层。
- 先覆盖高频本地动作：
  - `Ctrl+N` 下一会话
  - `Ctrl+P` 上一会话
  - `Ctrl+L` 重绘
  - `Esc` 取消草稿
- 更新 TUI banner / controls / footer / help，让快捷键可发现。
- 增加 focused tests 覆盖 shortcut 解析与 TUI 文案面。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `production-runtime-architecture`: 补充 TUI 键盘快捷键与本地交互安全边界 requirement

## Impact

- 影响代码：
  - `apps/agent-cli/src/entrypoints/tui.ts`
  - `apps/agent-cli/src/cli-ui.ts`
- 影响测试：
  - `apps/agent-cli/test/unit/entrypoints/tui.test.ts`
  - `apps/agent-cli/test/unit/cli-ui.test.ts`
