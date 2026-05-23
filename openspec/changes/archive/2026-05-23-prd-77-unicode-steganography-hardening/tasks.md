## 1. 测试先行

- [x] 1.1 在 `data-hygiene` 单元测试中新增零宽格式字符清理用例，并确认实现前失败
- [x] 1.2 新增 PRD-77 smoke 测试，覆盖嵌套外部文本递归清理和 secret redaction 组合路径

## 2. 核心实现

- [x] 2.1 扩展 `sanitizeVisibleText`，移除 `U+200B`、`U+200C`、`U+200D`、`U+2060`、`U+FEFF`
- [x] 2.2 确认 hidden control、bidi control、secret redaction 和 stable scope hash 行为不退化

## 3. 验证与收口

- [x] 3.1 运行 PRD-77 单元测试与 smoke 测试
- [x] 3.2 运行 `openspec validate` 与 `pnpm build`
- [x] 3.3 归档 OpenSpec change 并完成本地提交
