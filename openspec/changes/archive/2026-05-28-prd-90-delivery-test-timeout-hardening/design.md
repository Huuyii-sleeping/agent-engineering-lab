## Context

`test/unit/delivery.test.ts` 的通过路径不是纯内存单测，会在临时 workspace 中真实执行 `pnpm lint`、`pnpm test`、`pnpm build`。单独运行该文件时用例可在约 2s 内通过，但全量 Vitest 并发执行时，Windows 子进程启动与包管理器开销可能让该用例超过默认 5s 超时。

## Goals / Non-Goals

**Goals:**

- 给真实子进程覆盖用例设置局部、明确的测试超时预算。
- 保持测试仍然覆盖真实 `runDeliveryValidation` 流程与报告落盘。
- 让 `pnpm --dir apps/agent-cli test` 在并发环境下稳定通过。

**Non-Goals:**

- 不修改 delivery validation 的运行时代码。
- 不改全局 Vitest 超时，避免掩盖其他单测的异常耗时。
- 不把该测试改成纯 mock，因为它承担真实命令执行链路的回归覆盖。

## Decisions

1. 对 `delivery.test.ts` 内真实执行 `pnpm` 子进程的两个用例设置局部 timeout。
   - 理由：失败根因是用例默认 5s 预算与真实子进程覆盖范围不匹配，局部 timeout 最小化影响面。
   - 备选：修改 Vitest 全局 `testTimeout`。不采用，因为会放宽所有单测预算，降低慢测试发现能力。
   - 备选：mock `runDeliveryStage`。不采用，因为会削弱 delivery validation 的真实集成覆盖。

2. 保留 secret scanning 用例默认超时。
   - 理由：该用例不启动多段 `pnpm` 子进程，默认预算足够；只扩大必要用例的预算。
   - 备选：给整个 `describe` 设置统一 timeout。范围更大，不采用。

## Risks / Trade-offs

- [Risk] 局部 timeout 变大可能让真实卡死延迟暴露。
  → Mitigation: 只对真实子进程用例设置预算，并且 production `runDeliveryStage` 仍受 `AGENT_DELIVERY_STAGE_TIMEOUT_MS` 控制。

- [Risk] Windows 子进程启动时间继续变慢。
  → Mitigation: timeout 选择为覆盖全量并发负载的保守值，同时通过全量测试验证。
