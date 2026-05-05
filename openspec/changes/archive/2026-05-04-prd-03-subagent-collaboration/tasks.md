## 1. Specification & design

- [x] 1.1 完成 proposal，明确 In Scope / Out of Scope 与 capability 名称
- [x] 1.2 完成 design，定义子代理状态机与异步执行模型
- [x] 1.3 完成 delta spec，覆盖生命周期、异步等待、安全边界与兼容性

## 2. Subagent tool implementation

- [x] 2.1 新增 `src/tools/subagent.ts`，实现 `SubagentManager` 与 5 个工具处理函数
- [x] 2.2 在 `src/tools/index.ts` 注册工具定义与 handler 分发
- [x] 2.3 为工具错误返回增加统一错误码（not found / busy / closed / timeout）

## 3. Validation

- [x] 3.1 构建 TypeScript 项目并修复编译错误
- [x] 3.2 手工验证一次 `spawn -> send -> wait -> list -> close` 基本链路
- [x] 3.3 回归验证现有 `todo/task/file/bash` 不受影响
