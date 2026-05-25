## 1. 测试先行

- [x] 1.1 新增 Ink TUI 输入 reducer 单元测试，覆盖字符、退格、提交和退出
- [x] 1.2 更新 smoke 测试，验证管道输入 `/help\nq` 可提交本地命令并退出

## 2. 核心实现

- [x] 2.1 实现可测试的 `reduceInkTuiInput`
- [x] 2.2 在 `InkTuiPreviewApp` 中使用 `useInput` 管理 prompt buffer 和消息流
- [x] 2.3 调整入口层提交逻辑，复用现有 `handleTerminalTuiCommand`
- [x] 2.4 将默认 interactive CLI 切换到 Ink/TSX surface，并保留 `classic` 回退入口

## 3. 验证与收口

- [x] 3.1 运行 PRD-82 单元测试、smoke 测试与 `pnpm build`
- [x] 3.2 运行 `openspec validate`、`openspec status`
- [x] 3.3 归档 OpenSpec change 并完成本地提交
