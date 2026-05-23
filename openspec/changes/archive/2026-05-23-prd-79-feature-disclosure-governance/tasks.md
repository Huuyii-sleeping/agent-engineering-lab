## 1. 测试先行

- [x] 1.1 新增 feature disclosure registry 单元测试，并确认实现前失败
- [x] 1.2 新增 CLI/UI/palette 单元测试，确认 `/features` 可发现且当前没有隐藏启用项
- [x] 1.3 新增 PRD-79 smoke 测试，验证 `/features` 输出治理摘要

## 2. 核心实现

- [x] 2.1 实现 `cli/features.ts`，维护本地功能披露清单与摘要
- [x] 2.2 新增 `/features` 命令与 UI renderer
- [x] 2.3 将 `/features` 纳入 `/help`、`/help runtime` 与 command palette

## 3. 验证与收口

- [x] 3.1 运行 PRD-79 单元测试与 smoke 测试
- [x] 3.2 运行 `openspec validate` 与 `pnpm build`
- [x] 3.3 归档 OpenSpec change 并完成本地提交
