## ADDED Requirements

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
