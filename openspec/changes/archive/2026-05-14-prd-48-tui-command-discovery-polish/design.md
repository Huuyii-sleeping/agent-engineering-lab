## Context

当前终端产品面已经具备较完整的本地控制能力，但帮助系统仍有两个明显问题：

- `/help` 采用单层平铺清单，命令越来越多后，可读性迅速下降。
- TUI 把大量命令直接塞进 `Controls` panel，虽然“都能看到”，但不是可持续的信息架构。

这会带来成熟度问题：用户第一次进入 TUI 时需要自己筛命令，进入 composer 后也看不到更聚焦的草稿操作提示。当前最合适的方向不是再加大功能面，而是抽出一套共享的 help / guide 数据模型，让 CLI 与 TUI 复用。

## Goals / Non-Goals

**Goals:**

- 让 `/help` 支持按主题分层，输出更像面向工作流的指南，而不是纯命令表。
- 让 TUI 控制面按当前状态给出更紧凑、更上下文化的操作提示。
- 为 TUI 提供专用 help 快捷入口，并沿用已有 raw-mode 快捷键边界。
- 保持零依赖实现，复用现有 `cli-ui` renderer 和 `dispatchCliCommand` 流程。

**Non-Goals:**

- 不实现 readline 自动补全或命令 palette。
- 不引入新的 TUI 框架或复杂焦点管理。
- 不改变现有 slash command 的业务语义。
- 不新增远端 / Web 帮助界面。

## Decisions

### Decision 1: 把帮助内容抽象成共享 topic registry

采纳：

- 在 `cli-ui` 中定义 help topics 和 topic 条目。
- `/help` 默认展示概览；`/help <topic>` 展示该主题下的命令、说明和示例。
- TUI guide 直接复用同一份 topic 数据，而不是再维护第二套文案。

不采用：

- 继续在 `renderCliHelp()` 和 TUI panel 中分别手写帮助字符串。

原因：

- 当前产品面的核心问题是信息架构分裂。共享 registry 能保证 CLI 和 TUI 对同一能力使用同一套表达。

### Decision 2: TUI 用上下文化 Guide + Shortcuts，而不是继续扩展静态 Controls 墙

采纳：

- 将左侧控制面从“完整命令清单”收缩为上下文化 guide。
- 默认状态下突出会话导航、帮助入口、运行时查看；composer active 时突出 `/preview`、`/send`、`/pop`、`/cancel`。
- 保留高频快捷键说明，但不再把全部命令平铺到同一个 panel 中。

不采用：

- 继续保留完整静态命令墙，只在底部追加几行帮助。

原因：

- 静态命令墙会随着产品面增长持续恶化。问题不在“没展示”，而在“展示得太平均、太冗余”。

### Decision 3: Help 快捷入口复用现有 raw-mode shortcut 管线

采纳：

- 新增 `Ctrl+G -> /help`，仅在 prompt buffer 为空时生效。
- 继续走 `resolveTerminalTuiShortcut()` 和 `handleTerminalTuiCommand()`，避免再引入新的输入分支。

不采用：

- 绑定 `?`、`F1` 或自定义 overlay 模式。

原因：

- `?` 会和正常输入冲突，`F1` 在不同终端上一致性较差。`Ctrl+G` 成本低、冲突小，且能复用已有安全边界。

## Risks / Trade-offs

- [Risk] help topic 数量继续增长后再次变复杂 -> Mitigation：先按工作流主题建模，只覆盖高频主题，保留 `/help all` 兜底。
- [Risk] TUI Guide 过度压缩导致低频命令难发现 -> Mitigation：guide 中固定保留 `/help` 和 topic 提示，完整命令仍可通过 `/help all` 查看。
- [Risk] 快捷键增加后与正文输入冲突 -> Mitigation：继续沿用“buffer 非空不触发全局快捷键”的现有规则。
