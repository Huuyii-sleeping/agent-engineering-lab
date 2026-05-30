## ADDED Requirements

### Requirement: Delivery validation tests MUST budget real subprocess coverage explicitly
交付验证测试在覆盖真实 `pnpm` 子进程阶段执行时，MUST 为对应用例设置局部、明确的测试超时预算，避免全量并发测试把正常子进程调度开销误判为业务失败。

#### Scenario: 全量测试中执行真实交付验证用例
- **WHEN** `agent-cli` 全量测试并发执行，且 delivery validation 单测启动真实 `pnpm` 阶段命令
- **THEN** 对应用例在明确测试预算内完成，不因 Vitest 默认 5s 用例超时而失败

#### Scenario: 保持交付验证运行时语义
- **WHEN** 调整 delivery validation 单测的测试预算
- **THEN** `runDeliveryValidation` 的阶段顺序、失败分类、retry 语义和 report JSON shape 保持不变
