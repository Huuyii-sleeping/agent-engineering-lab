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

### Requirement: Observability payloads MUST redact sensitive content before persistence
observability 与 audit payload MUST 在落盘前统一执行隐藏字符清洗和 secret-like 内容脱敏，避免结构化事件日志直接保存敏感值。

#### Scenario: observability event 包含敏感字段
- **WHEN** 系统写入带有 token、password 或 api key 的 observability payload
- **THEN** `.observability/events.jsonl` 中保存脱敏后的字段值
- **AND** 原始敏感值不得直接进入事件日志

#### Scenario: observability payload 包含隐藏字符
- **WHEN** 系统写入包含 bidi 或隐藏控制字符的 observability payload
- **THEN** `.observability/events.jsonl` 中保存清理后的可见文本

#### Scenario: observability payload 包含 MCP 标识
- **WHEN** 系统写入与 MCP 工具相关的 observability payload
- **THEN** 事件日志与聚合指标不得直接暴露私有 MCP server 名称
