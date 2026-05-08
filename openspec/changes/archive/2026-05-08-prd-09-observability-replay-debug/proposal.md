## Why

当前 Agent 已具备主循环、工具调用、子代理、后台任务与安全网关能力，但缺少统一的可观测性与回放机制。出现执行异常、工具失败或行为回归时，现有 stdout 日志不足以稳定关联上下文、参数、耗时和最终结果，导致排障与回归验证成本偏高。

## What Changes

- 新增统一观测运行时：为每轮主循环生成 `trace_id`，为每次工具调用生成 `span_id`，并记录结构化事件。
- 新增结构化事件日志：将关键事件写入 `.observability/events.jsonl`。
- 新增指标快照：聚合工具调用次数、失败率、耗时和 token 估算，写入 `.observability/metrics.json`。
- 新增回放器：支持按 `trace_id` 读取事件并执行 replay，默认 dry-run 阻断高危副作用。
- 将主循环、工具执行、后台任务、子代理通知与安全阻断结果接入统一观测事件流。

## In Scope

- 主循环级 `trace_id` 与工具级 `span_id`
- JSONL 结构化事件落盘
- 基础指标聚合与快照导出
- 按 `trace_id` 过滤回放
- 回放模式默认 dry-run

## Out of Scope

- 完整 APM 平台接入
- 分布式 tracing 全链路接入
- 外部指标后端与可视化看板

## Capabilities

### New Capabilities
- `observability-replay-debug`: 统一事件日志、指标聚合、轨迹回放与 dry-run 保护

### Modified Capabilities
- `core-agent-loop`: 主循环新增 trace/span 分配、观测事件写入与回放模式约束
- `subagent-collaboration`: 子代理完成/失败通知需要进入统一观测事件流
- `background-task-runtime`: 后台任务启动、完成、失败事件需要进入统一观测事件流

## Impact

- 影响代码目录：`src/agent-loop.ts`、`src/tools/index.ts`、`src/tools/base.ts`、`src/tools/background-task.ts`、`src/tools/subagent.ts`、`src/runtime-config.ts`
- 新增观测运行时与 replay 相关模块
- 新增运行时目录：`.observability/`
