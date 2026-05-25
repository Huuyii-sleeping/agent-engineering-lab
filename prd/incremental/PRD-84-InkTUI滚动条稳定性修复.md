# PRD-84 Ink TUI 滚动条稳定性修复

## 背景

默认 CLI 切换到 Ink/TSX surface 后，交互界面在主终端缓冲区中重绘。PRD-83 新增 scheduler interval 后，即使没有 due reminder，也会周期性更新 React state，导致终端滚动条在底部附近来回跳动。

## 目标

- 交互式 Ink TUI 使用 alternate screen，避免污染主终端 scrollback。
- scheduler 空轮询不触发 React state 变化或界面重绘。
- 非 TTY smoke 输出保持不变。

## 非目标

- 不重写消息布局。
- 不实现消息历史虚拟滚动。

## 验收标准

- 空 scheduled tick 不改变 Ink 状态对象。
- `tui-ink` 非 TTY smoke 仍通过。
- `pnpm build` 通过。
