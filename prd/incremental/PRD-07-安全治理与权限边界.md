# PRD-07 安全治理与权限边界

## 目标

在现有工具与自治能力基础上，建立可配置、可审计的安全策略体系，避免误操作、高危命令滥用和越权执行。

## 范围（In Scope）

- PolicyEngine（规则匹配 + 风险分级 + 拦截/审批/放行）。
- 高危操作审批流（ApprovalQueue）。
- 工具级权限矩阵（按工具、路径、命令模式、时段、角色）。
- 安全审计日志（策略命中、审批决策、最终执行结果）。

## 非目标（Out of Scope）

- 企业级 SIEM 集成。
- 完整零信任身份平台接入。

## 功能要求

- 命令风险分级：`low/medium/high/critical`。
- 高危动作默认 `deny` 或 `require_approval`。
- 文件路径规则支持 allow/deny 前缀与 glob。
- 审批请求包含：`request_id/action/risk/reason/suggested_scope/ttl`。
- 审批状态：`pending/approved/rejected/expired`。
- 审计日志写入 `.audit/security_events.jsonl`。

## 验收标准（AC）

- AC-07-1：高危命令在无审批时被拒绝并返回可读原因。
- AC-07-2：审批通过后同一请求可在有效期内执行一次。
- AC-07-3：所有策略命中与审批决策可在审计日志中追溯。
- AC-07-4：策略变更可热加载且不重启主进程。

## 实施顺序

1. 先实现 `PolicyEngine` 与工具执行前拦截点。
2. 再实现 `ApprovalQueue` 与请求生命周期。
3. 最后实现审计日志与策略热更新。
