# PRD-52 TUI 实时 Palette 过滤

## 背景

`PRD-51` 已经让 TUI 有了独立的 palette panel 和本地选择面，但 query 仍需要通过回车提交，距离更自然的 launcher 交互还差一步。

## 目标

- 让 palette query 在 TUI 中按键后立即刷新。
- 让回车始终执行当前选中项，而不是再承担“刷新 query”的职责。
- 保持 palette 全程留在本地，不进入模型请求链路。

## In Scope

- palette 打开时的字符级 query 刷新
- `backspace/delete` 对 query 的本地回退
- `Enter` 直接执行当前选中候选
- focused tests、build、OpenSpec strict

## Out of Scope

- 图形化 overlay
- 鼠标交互
- 模型生成式 ranking
- 复杂光标编辑

## 验收标准

- palette 打开时，键入字符会即时刷新结果。
- `backspace/delete` 会即时回退 query 并刷新结果。
- palette 打开时，回车直接执行当前选中项。
- focused tests、build、OpenSpec strict 通过。
