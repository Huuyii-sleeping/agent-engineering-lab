# PRD-51 TUI 即时 Palette 模式

## 背景

`PRD-50` 已经把 `/palette`、`/palette <query>`、`/palette open <index>` 和 `Ctrl+K` 做出来了，但当前仍偏命令式。用户能搜到动作，但还没有进入一个真正的 TUI 本地 launcher 面。

## 目标

- 为 TUI 提供独立的 palette panel。
- 支持本地键盘导航和直接执行。
- 在 palette 打开时，把普通文本回车解释为本地 query，而不是模型输入。
- 保持 runtime 与 slash command 语义不变。

## In Scope

- TUI palette open/close 状态
- 独立 Palette panel 渲染
- `Ctrl+K` 打开/关闭
- `Up` / `Down` / `Ctrl+N` / `Ctrl+P` 本地移动选中项
- 空行回车执行当前选中项
- palette 打开时，普通文本回车更新 query
- focused tests、build、OpenSpec strict

## Out of Scope

- 真正的字符级实时过滤 overlay
- 鼠标交互
- Web launcher
- 模型推荐式 action ranking

## 验收标准

- `Ctrl+K` 打开 TUI palette panel，且再次触发可关闭。
- palette panel 显示 query、结果数、当前选中项和操作提示。
- palette 打开时，空行回车执行当前选中项。
- palette 打开时，输入普通文本并回车会刷新 palette query，不进入模型链路。
- `Up` / `Down` / `Ctrl+N` / `Ctrl+P` 可本地切换选中项。
- focused tests、build、OpenSpec strict 通过。
