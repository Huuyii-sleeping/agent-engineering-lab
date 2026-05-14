# PRD-45 CLI Composer 编辑抛光

## 背景

PRD-44 解决了“能进入草稿模式”，但还没有解决“草稿真的好用”：

- 空行会丢，代码块和日志片段会被破坏。
- 草稿只能一路追加，没有本地撤回。
- TUI 里缺少独立 draft 可视面，用户只能靠 prompt/footer 猜当前草稿状态。

如果要继续逼近 Claude Code 那种终端体验，这一层必须继续补。

## 目标

- 保留 composer 模式下的空行输入。
- 提供轻量本地撤回命令。
- 让 `/preview` 和 TUI draft 面更清晰、更有结构。
- 保持实现轻量，不引入复杂全屏编辑器。

## In Scope

- composer 模式下保留空行。
- 新增 `/pop [n]`。
- 强化 `/preview` 输出。
- TUI 增加 draft panel。
- focused tests、build、OpenSpec strict。

## Out of Scope

- 外部编辑器集成。
- 任意行编辑、移动、替换。
- Vim / Emacs 风格键位。
- 模型层 prompt 语义调整。

## 验收标准

- composer 模式下输入空行会进入草稿。
- `/pop` 能撤回最后 1 行，`/pop n` 能撤回最后 N 行。
- `/preview` 能更清晰地展示草稿结构。
- TUI 在 composer active 时能显示独立 draft panel。
- focused tests、build、OpenSpec strict 通过。
