# PRD-54 TUI Palette 高亮与预览

## 背景

`PRD-53` 已经让 palette 具备了 command bar 和结果浮层，但结果仍然偏“纯文本列表”。要进一步提升 launcher 的可扫读性，需要给 query 命中做高亮，并让当前选中项在 command bar 内直接带出预览摘要。

## 目标

- 为 palette 结果增加 query 命中高亮。
- 为 command bar 增加当前选中项预览摘要。
- 继续提升 launcher 的可扫读性和紧凑度。

## In Scope

- query 命中高亮
- command bar preview 行
- focused tests、build、OpenSpec strict

## Out of Scope

- 复杂富文本高亮
- 图形化动画
- 新的输入语义

## 验收标准

- palette 结果中的 query 命中会被明确标记。
- command bar 会显示当前选中项的 summary preview。
- focused tests、build、OpenSpec strict 通过。
