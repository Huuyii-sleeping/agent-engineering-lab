# PRD-57 TUI Palette 浮层抛光

## 背景

`PRD-53` 到 `PRD-55` 已经把 TUI palette 做成 command bar + results overlay 的 launcher 形态，但当前浮层仍然偏重：`Command Bar` 占面偏宽、结果行重复信息偏多、提示语也更像说明书而不是高频 launcher 提示。

## 目标

- 收紧 palette overlay 的块面和文案密度。
- 让当前可执行命令比标题描述更快被扫到。
- 把打开态提示收口成更短的 launcher keys hint。

## In Scope

- 窄宽度居中的 `Command Bar`
- 更轻的 `Palette Results` 浮层块
- palette 结果行改为命令优先
- 精简打开态 keys hint
- focused tests、build、OpenSpec strict

## Out of Scope

- palette 搜索与排序语义重做
- CLI `/palette` 文本输出重构
- 新的终端主题系统
- draw workflow 执行链路

## 验收标准

- palette 打开时，`Command Bar` 与 `Palette Results` 以共享的轻量居中布局展示。
- command bar 只保留 query、focus、preview 等核心信息，不再重复大段状态说明。
- palette 结果会优先展示当前可执行命令，并保留 query 命中与分组信息。
- 打开态提示会收口成简短 keys hint，但不影响执行与导航语义。
- focused tests、build、OpenSpec strict 通过。
