## 1. PRD 与规格

- [x] 1.1 新增 PRD-47，定义 TUI 键盘快捷键范围
- [x] 1.2 新增 OpenSpec proposal / design / spec / tasks

## 2. TUI Shortcut 层

- [x] 2.1 新增 TUI shortcut 解析器，映射 `Ctrl+N/P/L` 与 `Esc`
- [x] 2.2 在 TTY 模式接入 keypress 监听，并复用现有 slash command 语义
- [x] 2.3 保证快捷键只在输入缓冲为空时触发，并支持等待输入时安全重绘

## 3. TUI 产品面

- [x] 3.1 更新 TUI banner / controls / footer 的快捷键提示
- [x] 3.2 更新 help 文案，补充 TUI keyboard affordances

## 4. 验证

- [x] 4.1 focused tests 覆盖 shortcut 解析与 TUI 文案面
- [x] 4.2 `pnpm --filter agent-cli test -- cli-ui.test.ts entrypoints/tui.test.ts`
- [x] 4.3 `pnpm --filter agent-cli build`
- [x] 4.4 `openspec validate prd-47-tui-keyboard-shortcuts --strict`
- [x] 4.5 `git diff --check`
