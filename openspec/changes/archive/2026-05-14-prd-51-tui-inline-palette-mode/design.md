## Context

`PRD-50` 已经把 palette 搜索和结果执行做成了共享 helper，但 TUI 侧仍然只是把 palette 输出作为普通文本返回。下一步最合适的产品化方向，是在 TUI 内引入一个本地状态机，而不是再增加一组新的 slash command。

## Goals / Non-Goals

**Goals**

- 增加 TUI palette mode，而不是只增加 palette 文本输出。
- 复用现有 `CliPaletteStore` 和搜索逻辑。
- 让 palette 模式的 query、导航和执行全部留在本地。

**Non-Goals**

- 不实现完整 overlay 弹层系统。
- 不做字符级的实时过滤动画。
- 不修改 runtime / model 请求协议。

## Decisions

### Decision 1: 先做 panel mode，而不是全屏 overlay

采纳：

- 在现有 dashboard 内增加 `Palette` panel。
- 打开后通过 panel 展示 query、结果数、当前选中项和键位提示。

原因：

- 当前 TUI 仍建立在 `readline` 与 ANSI 重绘之上，panel mode 更容易与既有结构兼容。

### Decision 2: palette 打开时，把普通文本回车解释为本地查询

采纳：

- palette 打开时，非 slash 的输入不走 chat，而是作为 query 刷新 palette。
- 空行回车执行当前选中项。

原因：

- 这能在不侵入主模型链路的前提下，把 palette 变成一个独立本地模式。

### Decision 3: 用现有快捷键和方向键做最小导航闭环

采纳：

- `Ctrl+K` 打开/关闭
- `Up` / `Down`
- `Ctrl+N` / `Ctrl+P`
- `Esc` 关闭
- `Enter` 执行

原因：

- 这些键已经符合终端交互习惯，并且不要求引入新的输入系统。

## Risks / Trade-offs

- [Risk] 仍不是完整 overlay，视觉上和 Claude Code 还有距离
  - Mitigation：先把本地模式、键盘闭环和 panel 结构做稳定，再考虑 overlay 化
- [Risk] query 目前是“回车提交刷新”，不是字符级实时过滤
  - Mitigation：先保证模式切换和执行链路稳定，后续再做更细粒度输入体验
