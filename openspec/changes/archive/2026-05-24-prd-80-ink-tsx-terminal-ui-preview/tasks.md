## 1. 测试先行

- [x] 1.1 新增 CLI dispatcher 单元测试，覆盖 `tui-ink` 与 `--tui-ink` 解析和分发
- [x] 1.2 新增 Ink TUI snapshot 单元测试，确认预览数据包含标题、快捷键、guide 与 palette 摘要
- [x] 1.3 新增 PRD-80 smoke 测试，验证管道输入 `q` 可退出并输出 Ink/TSX 预览内容

## 2. 核心实现

- [x] 2.1 增加 React/Ink 依赖与 TSX 编译配置
- [x] 2.2 实现 Ink TUI preview snapshot 纯函数和 TSX 组件
- [x] 2.3 新增 `entrypoints/tui-ink.tsx`，支持 `q`、`Esc`、`Ctrl+C` 退出
- [x] 2.4 将 `tui-ink` / `--tui-ink` 接入 CLI dispatcher 和 help

## 3. 验证与收口

- [x] 3.1 运行 PRD-80 单元测试与 smoke 测试
- [x] 3.2 运行 `openspec validate`、`openspec status` 与 `pnpm build`
- [x] 3.3 归档 OpenSpec change 并完成本地提交
