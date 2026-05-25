## Context

`tui-ink` 当前由 `buildInkTuiPreviewSnapshot()` 生成静态 snapshot，再由 `InkTuiPreviewApp` 渲染。入口层额外监听 stdin，只处理 `q`、`Esc`、`Ctrl+C` 退出。该设计适合静态 smoke，但无法支持用户输入，也没有和现有 CLI command/runtime 融合。

## Goals / Non-Goals

**Goals:**

- 在组件层使用 Ink `useInput` 管理 prompt buffer。
- 把输入状态抽成纯 reducer，便于单元测试。
- 默认 `agent-cli` 使用 Ink/TSX CLI surface。
- 回车提交复用现有 `handleTerminalTuiCommand`。
- 保留非 TTY 管道 smoke 的可退出能力。

**Non-Goals:**

- 不实现多行 composer。
- 不实现复杂快捷键冲突处理。

## Decisions

### Decision 1: 用 reducer 管输入，用现有 TUI command handler 管业务

选择：新增 `reduceInkTuiInput()` 管理 prompt buffer；回车提交后由入口层调用 `handleTerminalTuiCommand()`。

理由：输入编辑适合组件本地状态；命令、shell 和 chat 语义已经在现有 TUI handler 中实现，应直接复用，避免重写两套 CLI 行为。

### Decision 2: 默认 interactive 入口切到 Ink，保留 classic 回退

选择：`agent-cli` 无参数启动 Ink/TSX CLI surface；`agent-cli classic` 启动旧 readline CLI。

理由：满足“直接替代 CLI 工具”的目标，同时保留可诊断回退入口。

### Decision 3: 退出只在 buffer 为空时由组件处理

选择：`q` 只在 prompt buffer 为空时退出；如果用户输入内容包含 `q`，按普通字符处理。

理由：更接近真实 prompt 输入语义，避免用户输入英文或命令时误退出。

## Risks / Trade-offs

- [Risk] 非 TTY 与 TTY 输入路径不同。→ Mitigation：reducer 单元测试覆盖行为，smoke 只验证管道提交/退出。
- [Risk] 用户误以为空输出是输入失败。→ Mitigation：无输出时明确提示输入已提交到 CLI runtime。

## Migration Plan

无需数据迁移。`tui-ink` 命令不变。

## Open Questions

无。
