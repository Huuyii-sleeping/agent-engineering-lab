## 1. 测试先行

- [x] 1.1 在 `query-engine-round` 单元测试中新增用户输入意图分类用例，并确认实现前失败
- [x] 1.2 新增 PRD-78 smoke 测试，验证 `loop_start` 本地事件落盘包含最小化意图标签

## 2. 核心实现

- [x] 2.1 实现用户输入意图分类 helper，覆盖负面反馈、继续执行和普通输入
- [x] 2.2 在 `recordQueryLoopStart` 的 payload 中加入 `userInputIntent`，不新增原始 prompt 字段

## 3. 验证与收口

- [x] 3.1 运行 PRD-78 单元测试与 smoke 测试
- [x] 3.2 运行 `openspec validate` 与 `pnpm build`
- [x] 3.3 归档 OpenSpec change 并完成本地提交
