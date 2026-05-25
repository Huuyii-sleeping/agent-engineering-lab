# Design

## Overview

修复采用显式渲染 cursor 的方式，而不是依赖终端原生光标。Ink 的布局是虚拟渲染树，原生 cursor 不一定停留在 prompt 输入位置；显式 glyph 更稳定，也更容易用单元测试覆盖。

## Decisions

### Decision 1: 使用 prompt render model

新增 `renderInkPromptInput()` 纯函数，输入 draft、placeholder 和 cursor 开关，输出：

- `cursor`
- `placeholder`
- `draft`
- `empty`

组件只负责把 render model 映射成 Ink `<Text>`。这样回归测试不依赖真实 TTY。

### Decision 2: 交互模式默认显示 cursor

`InkTuiPreviewApp` 根据 `interactive` 决定是否显示 cursor。交互模式显示，非交互脚本/快照模式关闭。

### Decision 3: Cursor 显示在插入位置

当前 reducer 只支持末尾追加和末尾删除，因此 cursor 固定显示在 draft 末尾。后续如果加入左右移动，可以扩展 render model 增加 cursor index。

## Risks

- 某些字体下 block glyph 宽度表现可能不同。当前采用单字符 cursor，避免布局跳动。
- 非交互输出若误开启 cursor 可能污染 smoke 快照，因此默认跟随 `interactive`。
