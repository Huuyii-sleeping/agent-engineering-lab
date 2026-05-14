# PRD-53 TUI Palette 浮层命令栏

## 背景

`PRD-52` 已经把 TUI palette 做成实时本地过滤，但视觉上仍然更像一个占据布局空间的功能面板，还不够接近 Claude Code 那种紧凑的 launcher 浮层。

## 目标

- 把 palette 收紧为顶部 command bar 与结果浮层块。
- 在 palette 打开时尽量保留主会话区高度。
- 强化 launcher 的视觉层级和局部性。

## In Scope

- 顶部 `Command Bar`
- 居中 `Palette Results` 浮层块
- 恢复主会话区高度
- focused tests、build、OpenSpec strict

## Out of Scope

- 真正意义上的终端像素级悬浮遮罩
- 鼠标交互
- 复杂动画

## 验收标准

- palette 打开时，TUI 显示顶部 command bar。
- palette 打开时，结果以紧凑浮层块展示。
- Conversation 区在 palette 打开时不再被压缩成大面积结果面板。
- focused tests、build、OpenSpec strict 通过。
