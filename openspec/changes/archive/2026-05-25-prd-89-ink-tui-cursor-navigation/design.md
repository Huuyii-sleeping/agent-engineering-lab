# Design

## Overview

当前 prompt reducer 是 append-only。修复方式是在 `InkTuiInputState` 中增加 `cursorIndex`，并让所有编辑操作都基于 Unicode code point 数组处理，避免中文字符被拆坏。

## Decisions

### Decision 1: Cursor index 使用 code point 下标

使用 `Array.from(draft)` 得到字符数组，`cursorIndex` 范围为 `[0, chars.length]`。这样中文、emoji 等非 BMP 字符比直接按 UTF-16 下标更安全。

### Decision 2: 兼容旧测试状态

测试和调用方可能构造没有 `cursorIndex` 的 state。reducer 会把缺省 `cursorIndex` 视为 draft 末尾，保持既有 append 行为兼容。

### Decision 3: Render model 输出 before/after

`renderInkPromptInput()` 增加 `beforeCursor`、`afterCursor`、`cursorIndex`。组件按 `beforeCursor + cursor + afterCursor` 渲染，测试断言 `visibleText`。

## Risks

- Paste 输入可能包含多个字符。实现按 code point 长度推进 cursor。
- 当前仍是单行输入；多行编辑后续应单独设计。
