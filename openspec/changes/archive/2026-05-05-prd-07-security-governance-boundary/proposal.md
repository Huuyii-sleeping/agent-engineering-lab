## Why

当前 Agent 已具备多工具执行、子代理、后台任务与自治能力，但缺少统一安全策略层。高危操作（尤其 shell 与文件写入）目前只能依赖局部硬编码拦截，无法支持分级风险、审批闭环、审计追踪与策略热更新。PRD-07 目标是建立可配置、可审计的权限边界。

## What Changes

- 新增 `PolicyEngine`：统一执行前策略评估（allow/deny/require_approval）。
- 新增 `ApprovalQueue`：高风险请求入队、审批、过期控制、一次性放行。
- 新增 `SecurityAudit`：策略命中、审批决策、执行结果统一写入审计日志。
- 新增工具：`security_check`、`security_request_approval`、`security_approve`、`security_reject`、`security_list_approvals`、`security_reload_policy`。
- 工具执行链路接入安全网关：在 `runToolByName` 与子代理 `runBaseToolByName` 前统一判定。

## In Scope

- 命令风险分级：`low/medium/high/critical`
- 高危操作默认 `deny` 或 `require_approval`
- 审批状态：`pending/approved/rejected/expired`
- 审计日志：`.audit/security_events.jsonl`
- 策略文件热加载：无需重启主进程

## Out of Scope

- 外部 IAM / SSO / SIEM 集成
- 组织级 RBAC 平台化管理

## Capabilities

### New Capabilities
- `security-governance-boundary`: 策略评估 + 审批队列 + 审计日志

### Modified Capabilities
- `multi-tool-file-ops`（执行前安全判定）
- `subagent-tool-execution`（子代理工具调用同样受安全策略约束）

