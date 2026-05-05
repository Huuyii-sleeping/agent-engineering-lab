# PRD-09 可观测性与回放调试

## 目标

让 Agent 的每次决策、工具调用、协议事件都可追踪、可回放、可定位问题，提升线上稳定性与排障效率。

## 范围（In Scope）

- 统一 Trace ID / Span ID。
- 结构化日志（JSON Lines）。
- 会话回放器（Replay Runner）。
- 关键指标采集（延迟、失败率、重试次数、token 消耗）。

## 非目标（Out of Scope）

- 完整 APM 平台实现。
- 分布式链路追踪全家桶接入。

## 功能要求

- 每轮 loop 分配 `trace_id`，每次工具调用分配 `span_id`。
- 日志落盘 `.observability/events.jsonl`。
- 指标快照 `.observability/metrics.json`。
- 支持按 `trace_id` 过滤回放。
- 回放模式下禁用高危副作用（默认 dry-run）。

## 验收标准（AC）

- AC-09-1：任意错误可通过 `trace_id` 关联到完整上下文。
- AC-09-2：工具失败可定位到参数、耗时、返回码。
- AC-09-3：回放同一轨迹能稳定复现实验结果（允许模型内容差异）。
- AC-09-4：关键指标可用于识别性能瓶颈与异常波动。

## 实施顺序

1. 先加 trace/span 和结构化事件日志。
2. 再做指标聚合与导出。
3. 最后实现回放器和 dry-run 保护。
