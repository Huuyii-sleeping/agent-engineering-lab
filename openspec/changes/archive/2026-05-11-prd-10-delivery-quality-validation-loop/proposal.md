## Why

当前 `apps/agent-cli` 已经具备 lint/test/build/smoke 等零散验证入口，也具备错误恢复、hook、observability 与安全审批能力，但“交付质量”仍停留在人工串联阶段：
- 验证命令散落在 `package.json` 和文档里，主循环无法统一触发
- 失败结果只有命令输出，没有结构化阶段、分类、修复建议
- 改完代码后不会自动形成“验证 -> 失败分析 -> 再修 -> 再验证”的闭环
- 交付结束时没有统一的 `delivery_report.json` 供评审、归档或后续自动化消费

PRD-10 需要把这些能力收敛为统一的交付验证闭环，让 Agent 不只是“会改代码”，而是能对本轮交付质量给出可追踪、自解释、可重复执行的结果。

## What Changes

- 新增统一的 delivery validation 模块，按阶段执行 `lint -> test -> build`
- 支持基于 workspace 变更和显式目标，选择附加验证项（如 smoke、回归）
- 将失败结果结构化为 `stage / code / message / suggestion`
- 为可恢复失败提供有限自动重试与修复提示收敛
- 将验证结果落盘为 `.delivery/delivery_report.json`
- 在主循环中检测本轮写操作后自动触发一次验证，并将结果摘要注入后续推理
- 暴露显式工具，允许 Agent 主动请求交付验证或读取最近报告

## Capabilities

### New Capabilities

- `delivery-quality-validation`: 定义交付验证流水线、结构化失败、自动重试和报告落盘

### Modified Capabilities

- `core-agent-loop`: 在本轮产生文件写入后，主循环会自动触发一次统一交付验证

## Impact

- 影响代码：
  - 新增 `apps/agent-cli/src/delivery.ts`
  - `apps/agent-cli/src/runtime-config.ts`
  - `apps/agent-cli/src/tools/base.ts`
  - `apps/agent-cli/src/agent-loop.ts`
- 影响测试：
  - 新增 delivery 单测
  - 新增 PRD-10 smoke
- 影响运行时产物：
  - 新增 `.delivery/delivery_report.json`
