# team-communication-protocol Specification

## Purpose
TBD - created by archiving change prd-05-team-communication-protocol. Update Purpose after archive.
## Requirements
### Requirement: Agent SHALL provide teammate and message bus management
系统 SHALL 提供队友管理和消息总线能力，使用 `.team/inbox/*.jsonl` 作为收件箱。

#### Scenario: 创建队友并设置状态
- **WHEN** 模型调用 `team_add_teammate` 后调用 `team_set_status`
- **THEN** 系统持久化队友并反映 `working/idle/shutdown` 状态

#### Scenario: 点对点与广播消息
- **WHEN** 模型调用 `team_message` 或 `team_broadcast`
- **THEN** 系统将消息写入目标队友 inbox 文件

### Requirement: Protocol requests MUST be tracked by request_id and status
系统 MUST 通过 `request_id` 关联协议请求与响应，并维护统一状态 `pending/approved/rejected`。

#### Scenario: 创建 shutdown 请求
- **WHEN** 模型调用 `team_shutdown_request`
- **THEN** 系统创建 `pending` 请求并生成 `request_id`

#### Scenario: 响应 shutdown 请求
- **WHEN** 模型调用 `team_shutdown_response` 且提供有效 `request_id`
- **THEN** 系统更新请求状态为 `approved` 或 `rejected`

#### Scenario: 创建和响应计划审批
- **WHEN** 模型调用 `team_plan_approval_request` 与 `team_plan_approval_response`
- **THEN** 系统完成同样的 pending->approved/rejected 状态流转

### Requirement: Agent SHALL provide observability for team state and inbox
系统 SHALL 提供队友列表、请求列表和 inbox 查询能力。

#### Scenario: 查看团队状态
- **WHEN** 模型调用 `team_list_teammates` 与 `team_list_requests`
- **THEN** 系统返回当前状态快照

#### Scenario: 查看某队友 inbox
- **WHEN** 模型调用 `team_read_inbox(teammate_id)`
- **THEN** 系统返回该队友 inbox 中的消息记录

### Requirement: Team persistence SHALL include schema version with backward-compatible reads
团队成员与协议请求的持久化记录 MUST 包含 `schemaVersion`；系统 MUST 兼容读取旧结构数据。

#### Scenario: 旧团队记录兼容读取
- **WHEN** `teammates.json` 中记录缺少 `schemaVersion`
- **THEN** 系统成功读取并补齐默认版本，不中断功能

#### Scenario: 旧协议请求兼容读取
- **WHEN** `requests.json` 中记录缺少 `schemaVersion`
- **THEN** 系统成功读取并保持协议流程可用

