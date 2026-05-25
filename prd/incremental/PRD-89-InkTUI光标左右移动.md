# PRD-89 Ink TUI 光标左右移动

## 背景

Ink/TSX TUI 当前 prompt 只支持末尾追加和末尾删除。用户按左右方向键时，内部没有维护光标位置，因此无法移动插入点；这会让 TUI 不符合基础 CLI 输入体验。

## 目标

- prompt 输入状态维护 `cursorIndex`。
- 左右方向键可以在字符边界移动光标。
- 移动光标后输入字符应插入到光标所在位置。
- backspace 删除光标左侧字符，delete 删除光标右侧字符。
- Home/End 支持跳到行首/行尾。
- 实际 Ink 渲染输出能证明光标显示在文本中间位置。

## 非目标

- 不实现多行编辑。
- 不实现选区、复制粘贴高级编辑。
- 不引入新的 TUI 测试依赖。

## 验收标准

- 单元测试覆盖左移、右移、Home、End。
- 单元测试覆盖光标移动后的中间插入。
- 单元测试覆盖 backspace/delete 的光标位置语义。
- 组件级 renderToString 测试证明 `he▌llo` 这类中间光标输出存在。
- `pnpm build`、Ink TUI 单元测试、OpenSpec validate 通过。
