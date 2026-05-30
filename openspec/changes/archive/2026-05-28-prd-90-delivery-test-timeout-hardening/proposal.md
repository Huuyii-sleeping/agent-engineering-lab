## Why

全量执行 `agent-cli` 测试时，delivery validation 通过路径单测会真实启动多个 `pnpm` 子进程，在并发测试负载下偶发超过 Vitest 默认 5s 用例超时。现在需要把该测试的预算与其真实覆盖范围对齐，避免把环境调度开销误判为业务失败。

## What Changes

- 为 delivery validation 中真实执行子进程的单测设置明确、局部的测试超时预算。
- 保留现有真实命令执行覆盖，继续验证阶段执行、报告落盘和失败分类。
- 不改变运行时 delivery validation 的阶段顺序、命令解析、失败分类、retry 或 report JSON shape。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `delivery-quality-validation`: 明确交付验证测试覆盖在执行真实子进程时必须具备稳定的测试预算，不因默认用例超时造成全量测试偶发失败。

## Impact

- 影响文件：`apps/agent-cli/test/unit/delivery.test.ts`、`openspec/specs/delivery-quality-validation/spec.md`。
- 影响系统：仅测试稳定性与规格说明；不影响 CLI 运行时行为、工具 API 或外部依赖。
