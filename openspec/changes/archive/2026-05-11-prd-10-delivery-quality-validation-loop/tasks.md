## 1. Artifacts

- [x] 1.1 proposal/design/specs 完成

## 2. Implementation

- [x] 2.1 新增统一 delivery validation 模块、报告结构与落盘逻辑
- [x] 2.2 在 base tools 中新增显式验证/读报告工具
- [x] 2.3 在主循环接入“本轮写副作用后自动触发验证”
- [x] 2.4 支持失败分类、建议生成与有限自动重试
- [x] 2.5 基于改动路径补最小影响分析与附加 smoke 选择

## 3. Validation

- [x] 3.1 新增 delivery 单测
- [x] 3.2 新增 PRD-10 smoke，验证报告落盘、失败分类与自动触发
- [x] 3.3 运行 `pnpm --filter agent-cli test`、`pnpm --filter agent-cli build` 与对应 smoke
