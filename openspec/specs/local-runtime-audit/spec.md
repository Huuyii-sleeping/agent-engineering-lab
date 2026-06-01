# local-runtime-audit Specification

## Purpose
TBD - created by archiving change prd-100-local-runtime-audit-v1. Update Purpose after archive.
## Requirements
### Requirement: Local runtime audit MUST persist append-only redacted events

系统 MUST 提供本地 `.audit/events.jsonl` append-only 审计账本，用于记录高价值 runtime 行为。每条事件 MUST 包含 schemaVersion、id、timestamp、category、action、outcome、subject、summary，以及可选 sessionId、traceId、metadata。

#### Scenario: Audit event is persisted

- **WHEN** runtime 记录一次本地审计事件
- **THEN** `.audit/events.jsonl` 追加一行可解析 JSON
- **AND** 事件包含稳定 id、时间戳、category、action 与 outcome

#### Scenario: Audit payload is redacted before persistence

- **WHEN** 审计事件的 summary 或 metadata 包含 token、password、api key 或 hidden control 字符
- **THEN** 落盘 JSONL 中不得包含原始敏感值或不可见控制字符
- **AND** 审计事件仍保留可用于追责的脱敏摘要

### Requirement: Local runtime audit MUST cover critical local security actions

系统 MUST 在本地记录关键安全相关 runtime 行为，至少覆盖 session chat 生命周期、tool execution 结果、security approval 结果、DLP / secret scanning blocked 结果，以及 local cleanup / retention action。

#### Scenario: Service chat lifecycle is audited

- **WHEN** AgentService 执行 chat started、completed 或 failed
- **THEN** 本地 audit 账本记录对应 sessionId、action 与 outcome

#### Scenario: Tool or security block is audited

- **WHEN** 工具调用失败、被 hook/security policy 阻断，或 secret scanning 阻断输出
- **THEN** 本地 audit 账本记录 redacted tool/action 摘要与 blocked/failed outcome

### Requirement: Local runtime audit MUST support bounded local queries

系统 MUST 提供本地查询 helper，支持读取最近 N 条审计事件，并按 sessionId、traceId 或 category 过滤。查询 MUST 有默认上限，避免一次性加载无界结果。

#### Scenario: Query recent audit events

- **WHEN** 调用 audit query helper 读取最近事件
- **THEN** 结果按时间顺序返回不超过默认上限的事件

#### Scenario: Query audit events by session

- **WHEN** 调用 audit query helper 并指定 sessionId
- **THEN** 结果只包含该 session 的审计事件

### Requirement: Local runtime audit MUST record retention cleanup actions
系统 MUST 将本地 retention cleanup 作为关键治理动作写入 audit ledger，记录清理目标、结果和计数摘要。

#### Scenario: Retention cleanup audit event is persisted
- **WHEN** 本地 retention cleanup 执行并删除或扫描运行产物
- **THEN** `.audit/events.jsonl` 追加一条 category 为 `retention` 的事件
- **AND** 事件 metadata 不包含未脱敏的敏感字段

