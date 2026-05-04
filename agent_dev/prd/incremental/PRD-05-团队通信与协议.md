# PRD-05 团队通信与协议

## 目标

把单代理扩展为可协同的多代理团队，并补齐审批与关停协议。

## 范围（In Scope）

- `MessageBus/TeammateManager`（对应 S09）。
- `shutdown_request/shutdown_response/plan_approval` 协议（对应 S10）。

## 非目标（Out of Scope）

- 自动认领任务与 worktree 隔离。

## 功能要求

- 使用 `.team/inbox/*.jsonl` 作为消息收件箱。
- 支持 `message/broadcast/shutdown_request/shutdown_response/plan_approval_response`。
- 队友状态支持 `working/idle/shutdown`。
- 所有协议消息通过 `request_id` 关联。
- 请求状态统一 `pending/approved/rejected`。

## 验收标准（AC）

- AC-05-1：可创建队友并进行点对点/广播通信。
- AC-05-2：`/team` 与 `/inbox` 可观测团队状态和消息。
- AC-05-3：关停与计划审批协议可完整闭环。

## 实施顺序

1. 先做消息总线与队友管理。
2. 再做协议跟踪器与状态查询。
3. 最后加 CLI 观测命令并联调。

