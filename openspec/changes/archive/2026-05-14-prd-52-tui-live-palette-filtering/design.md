## Context

`PRD-51` 已把 palette 从文本输出升级成 TUI 独立模式，但 query 仍由 `readline.question()` 的整行提交驱动。要进一步贴近 launcher 体验，应该把 query 刷新前移到 keypress 阶段。

## Goals / Non-Goals

**Goals**

- 在不改 runtime 协议的前提下，实现 TUI palette 的实时过滤。
- 保持当前 panel mode 和选择状态机。
- 让 `Enter` 只负责执行动作。

**Non-Goals**

- 不支持复杂光标编辑。
- 不引入新的输入子系统。
- 不实现 overlay 浮层。

## Decisions

### Decision 1: 在 keypress 阶段推导 palette query

采纳：

- 对普通字符、`backspace`、`delete` 做本地 query 推导。
- 立即刷新 palette view。

原因：

- 这样可以避免等整行提交后再刷新，交互更接近即时 launcher。

### Decision 2: 回车只负责执行当前选中项

采纳：

- palette 打开时，只要当前输入不是 slash command，回车就直接执行当前选中候选。

原因：

- query 已经是实时刷新的，回车不应再承担“提交查询”的职责。

## Risks / Trade-offs

- [Risk] 未支持复杂光标移动编辑
  - Mitigation：当前 palette 仍按“尾部输入”模型工作，先优先保证 launcher 主流程
- [Risk] keypress 和 readline 内部状态不同步
  - Mitigation：仅对简单输入类型做推导，并在 redraw 时复用当前 buffer
