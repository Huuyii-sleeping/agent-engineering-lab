# team-communication-protocol Specification

## Purpose
定义多代理团队协作中的队友管理、消息投递、协议请求跟踪、收件箱持久化与兼容读取机制，作为团队通信能力的稳定运行基线。
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

### Requirement: Team boundary corrections MUST preserve request, message and inbox semantics
Team 边界校正 MUST 保持队友状态、消息投递、协议请求跟踪与 inbox 读取的现有语义不变。

#### Scenario: 创建队友并发送消息
- **WHEN** 模型调用 `team_add_teammate`、`team_message` 或 `team_broadcast`
- **THEN** 系统继续写入同样的 teammate / inbox 结构和消息 shape

#### Scenario: 创建和响应协议请求
- **WHEN** 模型调用 `team_shutdown_request`、`team_shutdown_response`、`team_plan_approval_request` 或 `team_plan_approval_response`
- **THEN** 系统继续使用相同的 request_id 和 pending/approved/rejected 流转语义

#### Scenario: 读取旧团队记录
- **WHEN** `teammates.json` 或 `requests.json` 中记录缺少 `schemaVersion`
- **THEN** 系统仍可兼容读取并保持团队通信能力可用

### Requirement: Team inbox SHALL support unread tracking and explicit acknowledgment

team inbox SHALL 提供 unread 计数与显式 ack 语义，避免读取后仍重复重放同一批消息。

#### Scenario: User reads inbox without ack

- **WHEN** 模型调用 `team_read_inbox`
- **THEN** 系统 SHALL 返回 messages 与 unread 计数
- **AND** 读取本身 SHALL 不改变 unread 游标

#### Scenario: User acknowledges inbox messages

- **WHEN** 模型调用 `team_mark_inbox_read`
- **THEN** 系统 SHALL 更新该 teammate 的 inbox 游标
- **AND** 后续 `team_read_inbox` SHALL 仅把新消息计为 unread
