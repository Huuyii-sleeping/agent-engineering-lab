## 1. 测试稳定性修复

- [x] 1.1 为 `test/unit/delivery.test.ts` 中真实执行 `pnpm` 子进程的通过路径用例设置局部测试超时。
- [x] 1.2 为同文件中的失败分类用例设置局部测试超时，覆盖失败阶段真实子进程开销。

## 2. 验证与收口

- [x] 2.1 运行 `pnpm --dir apps/agent-cli exec vitest run test/unit/delivery.test.ts` 验证 targeted 单测。
- [x] 2.2 运行 `pnpm --dir apps/agent-cli test` 验证全量 agent-cli 测试。
- [x] 2.3 运行 OpenSpec status / validate 并归档变更。
