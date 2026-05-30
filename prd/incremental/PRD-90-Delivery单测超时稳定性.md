# PRD-90 Delivery 单测超时稳定性

## 背景

全量执行 `apps/agent-cli` 测试时，`test/unit/delivery.test.ts` 的通过路径用例偶发超过 Vitest 默认 5s 用例超时。该用例会真实启动 `pnpm lint`、`pnpm test`、`pnpm build` 三个子进程，单独执行可通过，但在全量并发测试下容易被子进程调度开销放大。

## 目标

- 保持 delivery validation 的运行时语义不变。
- 让 delivery 单测在全量并发测试中具备足够超时预算。
- 保留当前真实命令执行覆盖，不用 mock 替代核心验证链路。

## 范围

### In Scope

- 为 delivery validation 单测中真实执行子进程的用例设置明确测试超时。
- 补充 OpenSpec 记录，说明该稳定性约束。
- 运行针对性测试和全量测试验证。

### Out of Scope

- 不重构 delivery validation 执行器。
- 不改变 `runDeliveryValidation` 报告结构、阶段顺序、失败分类或 retry 语义。
- 不调整 TUI、scheduler 或其他模块行为。

## 验收标准

- `pnpm --dir apps/agent-cli exec vitest run test/unit/delivery.test.ts` 通过。
- `pnpm --dir apps/agent-cli test` 通过。
- `openspec validate prd-90-delivery-test-timeout-hardening --type change` 通过。
