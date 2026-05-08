# observability-replay-debug Specification

## Purpose
定义 Agent 的统一可观测性、结构化事件日志、指标快照与轨迹回放能力，支持问题定位、回归排查和安全 replay。

## Requirements
### Requirement: Agent SHALL emit structured observability events
系统 SHALL 为主循环、工具调用、异步通知和错误结果写入结构化观测事件到 `.observability/events.jsonl`。

#### Scenario: 工具调用事件落盘
- **WHEN** 主代理执行一次工具调用
- **THEN** 事件日志中包含对应的 `trace_id`、`span_id`、工具名、参数摘要、耗时与执行结果

#### Scenario: 异步通知事件落盘
- **WHEN** 子代理或后台任务产生完成或失败通知
- **THEN** 系统写入带有事件类型和摘要信息的观测事件

### Requirement: Agent SHALL maintain observability metrics snapshot
系统 SHALL 聚合关键运行指标并写入 `.observability/metrics.json`。

#### Scenario: 工具成功与失败更新指标
- **WHEN** 工具调用完成
- **THEN** 指标快照更新总调用数、失败数、累计耗时与最近更新时间

#### Scenario: 模型请求更新 token 指标
- **WHEN** 主循环发起模型请求
- **THEN** 指标快照更新请求轮次与 token 估算统计

### Requirement: Replay runner MUST support trace-scoped dry-run replay
系统 MUST 支持按 `trace_id` 过滤轨迹并执行 replay，且默认以 dry-run 模式阻断高危副作用。

#### Scenario: 指定 trace 回放
- **WHEN** 调用 replay runner 并传入 `trace_id`
- **THEN** 系统仅重放该轨迹下的可回放工具事件并返回回放摘要

#### Scenario: dry-run 阻断副作用
- **WHEN** 回放遇到高危副作用工具调用
- **THEN** 系统不执行真实动作，并返回标记为 `dry_run_blocked` 的结果
