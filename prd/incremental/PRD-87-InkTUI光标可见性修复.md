# PRD-87 Ink TUI 光标可见性修复

## 背景

当前 Ink/TSX TUI 的 prompt 输入区可以接收输入，但界面没有显示光标。原因是 Ink 接管终端绘制后，prompt 仅渲染普通文本，没有显式 cursor glyph，用户无法判断当前输入焦点和插入位置。

## 目标

- Ink TUI prompt 在交互模式下必须显示可见光标。
- 空 draft 时光标显示在 placeholder 前，避免用户误以为无法输入。
- 有 draft 时光标显示在 draft 末尾。
- 非交互快照仍可关闭光标，避免脚本输出包含交互光标噪音。

## 非目标

- 不实现左右移动、多行编辑或选择态。
- 不修改 readline classic TUI。
- 不改变 prompt 输入 reducer 的提交、删除和退出语义。

## 验收标准

- 单元测试覆盖空 draft 和已有 draft 两种 prompt 渲染。
- Ink TUI 交互渲染默认显示光标。
- `pnpm build` 和相关单元测试通过。
