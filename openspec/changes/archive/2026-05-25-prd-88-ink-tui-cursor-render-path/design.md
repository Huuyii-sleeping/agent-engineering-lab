# Design

## Overview

本次不再只暴露独立 `cursor` 字段，而是让 render model 输出 `visibleText`。测试直接断言 `visibleText`，避免生产 JSX 和测试模型之间脱节。

## Decisions

### Decision 1: Cursor 使用文本插入符

采用 `▌` 作为 cursor glyph。它比 full block 更像输入插入点，也不需要依赖 `inverse` 样式才能被用户识别。

### Decision 2: Render model 输出最终文本

`renderInkPromptInput()` 输出：

- `draft`
- `placeholder`
- `cursor`
- `visibleText`
- `empty`

空 draft 时 `visibleText = cursor + placeholder`；有 draft 时 `visibleText = draft + cursor`。非交互模式 `cursor` 为空，因此 `visibleText` 不包含交互噪音。

### Decision 3: JSX 分段渲染但遵循 model

组件仍分段渲染 draft、cursor 和 placeholder 以保留颜色，但内容来源必须与 render model 一致。

## Risks

- `▌` 是 Unicode 字符。当前仓库文档和 TUI 已使用 UTF-8 与中文文本，风险可接受。
