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

### Requirement: Telemetry governance MUST distinguish local observability from remote analytics
observability 与 telemetry 相关 surface MUST 明确区分当前本地 observability 数据面，与未来可能存在的 remote analytics / export 数据面，避免把二者混为一个默认启用的能力。

#### Scenario: Local observability is inspected
- **WHEN** 用户检查 observability / telemetry 数据治理信息
- **THEN** 系统明确标识当前本地事件、指标与 replay 数据面属于本地 observability
- **AND** 说明这些数据默认不等于远端 analytics 上传

#### Scenario: Remote analytics is not implemented
- **WHEN** 当前仓库没有 remote analytics sink 或组织级 telemetry 上报能力
- **THEN** 系统将对应数据面标记为 `保留缺口`、`未启用` 或等价状态
- **AND** 不把本地 `.observability` 误描述成远端遥测产品面

### Requirement: Local observability MUST support minimized and disabled collection postures
本地 observability MUST 支持至少 `default`、`minimal`、`disabled` 三类等价姿态，使用户可以减少或关闭事件、指标与 replay 数据的本地写入，而不是只能接受默认持续记录。

#### Scenario: Observability runs in minimized mode
- **WHEN** 用户启用 `observability.minimal` 或等价隐私姿态
- **THEN** 系统仅保留最小必要的本地诊断或审计信号
- **AND** 不继续按默认粒度写入完整 trace / span / replay 辅助数据

#### Scenario: Observability is disabled
- **WHEN** 用户启用 `observability.disabled` 或等价隐私姿态
- **THEN** 系统不再写入新的普通 observability 事件与指标快照
- **AND** 治理面能够说明当前本地观测面已被关闭或最小化

### Requirement: Remote telemetry privacy tiers MUST remain an explicit reserved gap
即使本地 observability 支持最小化或关闭，系统也 MUST 继续将 remote analytics / telemetry 的 essential-only、organization-level disable、payload ceiling 与 identity-bound policy 视为 `reserved_gap`，直到仓库真实具备远端 sink 与组织级控制面。

#### Scenario: User compares local observability and remote telemetry controls
- **WHEN** 用户检查 telemetry 相关隐私规避能力
- **THEN** 系统区分“本地 observability 已可最小化”与“远端 telemetry 控制仍未实现”
- **AND** 不把本地关闭能力误写成远端隐私分层已经就绪

### Requirement: Query loop observability MUST tag local user input intent

系统 MUST 在 query round 开始时为本地 `loop_start` observability 事件附加最小化用户输入意图标签，用于本地 replay、诊断与产品问题定位。

#### Scenario: 用户输入包含负面反馈意图
- **WHEN** 最新用户输入包含常见负面反馈表达
- **THEN** `loop_start` 事件的 `userInputIntent.negativeFeedback` 为 `true`
- **AND** 事件不新增保存完整原始 prompt 的字段

#### Scenario: 用户输入包含继续执行意图
- **WHEN** 最新用户输入包含继续执行或不要停止的表达
- **THEN** `loop_start` 事件的 `userInputIntent.keepGoing` 为 `true`
- **AND** query 主流程仍按原有逻辑继续执行，不因标签被阻断或改写

#### Scenario: 用户输入没有匹配意图
- **WHEN** 最新用户输入没有匹配负面反馈或继续执行表达
- **THEN** `loop_start` 事件仍包含 `userInputIntent`
- **AND** `negativeFeedback` 与 `keepGoing` 均为 `false`

