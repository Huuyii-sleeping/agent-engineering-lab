# PRD-44 CLI 多行输入与 Composer 模式

## 背景

当前 CLI / TUI 已经具备较完整的控制面，但输入仍然停留在“一行一发”。这会直接拉低终端 Agent 的可用性：

- 长提示词、分步骤任务、代码块、日志片段不适合一行输入。
- 用户没法先草拟、预览、再发送。
- TUI 虽然有更完整布局，但输入方式并没有比普通 shell 更高级。

如果想继续逼近 Claude Code 的终端体验，下一步最应该补的是输入编排层。

## 目标

- 为 CLI / TUI 提供本地多行 composer 模式。
- 支持“开始草稿 -> 逐行追加 -> 预览 -> 发送 / 取消”的完整闭环。
- 让输入提示符和页脚能清晰反映当前 draft 状态。
- 保持 slash command 导航和现有工具 / 权限 / 状态面一致。

## In Scope

- 新增 composer 状态管理。
- 新增命令：
  - `/compose`
  - `/preview`
  - `/send`
  - `/cancel`
- 在 composer 模式下，普通文本输入不直接发给模型，而是追加到草稿。
- CLI / TUI 提示符、help、footer、控制面文案更新。
- focused tests、build、OpenSpec strict。

## Out of Scope

- 外部编辑器集成。
- Vim / Emacs 风格完整键位。
- 鼠标交互。
- 模型侧 prompt 语义调整。

## 体验原则

- 输入状态必须清晰：用户随时知道当前是在“直接发送”还是“草稿模式”。
- 草稿操作必须可逆：预览、取消都要稳定。
- 尽量不污染日志：追加草稿时输出简洁，不刷屏。
- 与现有命令兼容：slash command 仍然是本地控制层，不进模型。

## 验收标准

- `/compose` 能进入多行草稿模式。
- composer 模式下普通文本只追加到草稿，不直接发给模型。
- `/preview` 能查看当前草稿。
- `/send` 会把当前草稿作为一次完整 prompt 发给模型，并清空草稿。
- `/cancel` 会丢弃草稿并退出 composer 模式。
- CLI 与 TUI 的提示符或页脚能显示 draft 状态。
- focused tests、build、OpenSpec strict 通过。
