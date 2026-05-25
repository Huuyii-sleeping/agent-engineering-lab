# PRD-88 Ink TUI 光标渲染路径修复

## 背景

PRD-87 增加了 prompt cursor render model，但用户实际运行 TUI 后仍看不到光标。当前实现只验证了 cursor 字段存在，没有验证最终 prompt 文本确实包含一个可见插入符；同时反色 block 在部分终端显示或复制输出中不够可靠。

## 目标

- prompt 可见文本必须直接包含 cursor glyph。
- 光标使用更易识别的 `▌`，避免依赖终端反色效果。
- 空 draft 与已有 draft 都能通过测试证明最终可见文本包含光标。

## 非目标

- 不实现原生 terminal cursor 精确坐标定位。
- 不新增 TUI 测试依赖。
- 不修改 prompt 输入 reducer 语义。

## 验收标准

- 单元测试证明 `visibleText` 在空 draft 时为 `▌Type a message`。
- 单元测试证明 `visibleText` 在已有 draft 时为 `hello▌`。
- `pnpm build`、Ink TUI 单元测试、OpenSpec validate 通过。
