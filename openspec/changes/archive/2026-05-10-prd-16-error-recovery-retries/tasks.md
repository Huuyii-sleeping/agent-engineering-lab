## 1. 恢复策略模块

- [x] 1.1 新增恢复状态、错误分类与恢复决策模块，输出 `continue | compact | backoff | fail`
- [x] 1.2 为 continuation / compact / transport 三类恢复路径补独立预算与 backoff 参数

## 2. 主循环接入

- [x] 2.1 改造 `agent-loop.ts`，在模型请求外层加入恢复循环
- [x] 2.2 支持输出截断续写、上下文过长压缩重试、瞬时传输错误退避重试
- [x] 2.3 在不可恢复或预算耗尽时明确终止并记录原因

## 3. 验证与回归

- [x] 3.1 新增恢复 selector 单元测试
- [x] 3.2 新增 PRD-16 smoke，验证续写、压缩、backoff 三条路径
- [x] 3.3 运行构建与相关测试，并清理测试运行产物
