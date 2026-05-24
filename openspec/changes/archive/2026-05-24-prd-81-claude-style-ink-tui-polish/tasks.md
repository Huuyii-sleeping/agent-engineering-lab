## 1. 测试先行

- [x] 1.1 更新 Ink TUI snapshot 单元测试，覆盖 REPL 消息流、prompt、statusline 与 footer
- [x] 1.2 更新 PRD-80 smoke 测试，验证 Claude 风格预览关键文本

## 2. 核心实现

- [x] 2.1 重构 Ink TUI snapshot 类型，移除 dashboard/card 主体模型
- [x] 2.2 重写 Ink TSX 组件为消息流 + slash pane + statusline + prompt bar
- [x] 2.3 保留 `q`、`Esc`、`Ctrl+C` 退出行为

## 3. 验证与收口

- [x] 3.1 运行 PRD-81 单元测试、smoke 测试与 `pnpm build`
- [x] 3.2 运行 `openspec validate`、`openspec status`
- [x] 3.3 归档 OpenSpec change 并完成本地提交
