# web-bff-control-plane Specification

## Purpose
TBD - created by archiving change prd-102-web-bff-v1. Update Purpose after archive.
## Requirements
### Requirement: Web BFF MUST expose stable Web-facing agent APIs
系统 MUST 提供独立 BFF app，向 Web Console 暴露 `/api/*` 接口，并把请求转发到 agent HTTP service，而不是让浏览器直接调用 agent runtime。

#### Scenario: Health request is forwarded to agent service
- **WHEN** Web 调用 `GET /api/health`
- **THEN** BFF 调用 agent service 的 `/health`
- **AND** 返回包含 BFF 状态与 agent 状态的 JSON 响应

#### Scenario: Session requests are forwarded through BFF
- **WHEN** Web 调用 session list、create 或 detail API
- **THEN** BFF 转发到 agent service 对应 session endpoint
- **AND** 返回稳定 JSON DTO

#### Scenario: Message request is mapped to agent chat
- **WHEN** Web 调用 `POST /api/sessions/:id/messages`
- **THEN** BFF 调用 agent service `/chat`
- **AND** 请求体包含 `session_id` 与 `message`

### Requirement: Web BFF MUST normalize errors and preflight requests
系统 MUST 对非法请求、上游不可用和上游错误返回稳定错误结构，并支持浏览器 CORS preflight。

#### Scenario: Agent service is unavailable
- **WHEN** BFF 无法连接 agent service
- **THEN** BFF 返回 `502`
- **AND** 响应体包含 `ok: false` 与 `error.code = "AGENT_UPSTREAM_UNAVAILABLE"`

#### Scenario: Browser sends OPTIONS request
- **WHEN** Web 浏览器发送 CORS preflight
- **THEN** BFF 返回 `204`
- **AND** 响应头包含允许本地 Web 调用的 CORS header

### Requirement: Web BFF MUST forward event streams
系统 MUST 支持将 agent service 的 SSE event stream 转发给 Web Console。

#### Scenario: Event stream is proxied
- **WHEN** Web 调用 `GET /api/events/stream`
- **THEN** BFF 连接 agent service `/events`
- **AND** 以 `text/event-stream` 返回上游事件内容

### Requirement: Web BFF MUST expose governance read APIs
系统 MUST 通过 BFF 提供 audit events 与 security findings 的只读 API，且数据来源 MUST 是 agent service endpoint。

#### Scenario: Audit events are queried through BFF
- **WHEN** Web 调用 `GET /api/audit/events`
- **THEN** BFF 转发到 agent service `/audit/events`
- **AND** 返回 agent service 的审计查询结果

#### Scenario: Security findings are queried through BFF
- **WHEN** Web 调用 `GET /api/security/findings`
- **THEN** BFF 转发到 agent service `/security/findings`
- **AND** 返回 agent service 的安全发现结果

