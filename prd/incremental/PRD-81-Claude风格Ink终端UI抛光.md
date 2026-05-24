# PRD-81 Claude 风格 Ink 终端 UI 抛光

## 背景

PRD-80 已新增 `tui-ink` 入口，但当前视觉形态偏 dashboard/card，和 Claude Code 源码中的 TSX 终端 UI 差距较大。参考 `liuup/claude-code-analysis` 的 `src/components/PromptInput`、`StatusLine`、`design-system/Pane` 和 `messages/*` 后，Claude Code 更接近 REPL 消息流：上方是对话与工具事件，底部是有边界的 prompt 输入区，再配合紧凑 footer/statusline。

## 目标

- 将 `tui-ink` 预览从卡片式 dashboard 改成 Claude Code 风格的 REPL 预览。
- 使用消息流、底部 prompt bar、statusline、footer hints、slash pane 等结构表达能力。
- 保持 `tui-ink` 仍是预览入口，不替换现有 `tui`。
- 更新测试和 smoke，避免退回卡片式布局。

## 非目标

- 不复制 Claude Code 源码实现或私有业务逻辑。
- 不完整迁移现有 `entrypoints/tui.ts` 的运行时交互。
- 不引入新的终端渲染库。

## 验收标准

- `tui-ink` 输出包含 REPL 消息流、底部 prompt 输入区、statusline 和 footer hints。
- 预览不再以多个大卡片 panel 作为主体布局。
- 单元测试覆盖 snapshot 中的 message rows、prompt、statusline 和 footer。
- smoke 测试验证 `q` 退出且输出包含 Claude 风格预览关键文本。
