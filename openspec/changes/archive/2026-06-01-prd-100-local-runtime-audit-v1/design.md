## Context

现有系统把诊断与追踪主要放在 observability 中，把审批与安全判断分别放在 security approvals、secret scanning 和 tool executor 中。observability 更偏调试与 replay，不能替代安全审计：审计需要 append-only、脱敏、结果明确、可按 session/trace/action 查询，并能纳入本地数据治理。

本次变更只做本地审计账本 v1，用最小写入面建立生产级基础设施。后续可以在独立变更中扩展更多 event source 或远端汇聚。

## Goals / Non-Goals

**Goals:**

- 建立本地 `.audit/events.jsonl` append-only 审计账本。
- 提供薄 API：记录事件、读取最近事件、按 session/trace/category 过滤。
- 所有 audit payload 在落盘前复用现有 data hygiene / redaction。
- 首批接入高价值路径：service chat 生命周期与 tool/security 阻断类事件。
- `.audit` 遵守本地 retention / cleanup 契约。

**Non-Goals:**

- 不做远端日志平台、SIEM、analytics sink。
- 不做权限管理 UI 或 RBAC。
- 不把 observability 全部复制成 audit。
- 不追求覆盖所有边缘事件，v1 只覆盖安全追责最关键路径。

## Decisions

1. 使用单独 `.audit/events.jsonl`，不复用 `.observability/events.jsonl`。

   - 选择原因：observability 面向调试，audit 面向追责和治理，数据语义、保留策略和查询维度不同。
   - 备选方案：在 observability 中增加 `audit=true` 字段。未采用原因：会混淆调试事件和审计事件，后续清理策略也难以分离。

2. 审计写入 API 保持薄层，不反向依赖业务模块。

   - 选择原因：业务路径只构造最小事件摘要，脱敏、id、timestamp、append-only 由 audit store 统一处理。
   - 备选方案：每个模块自行写 JSONL。未采用原因：会造成字段不一致、脱敏遗漏和测试重复。

3. 首批覆盖 service chat 与 tool/security 阻断，不追求一次性全覆盖。

   - 选择原因：这两类路径最能回答生产追责问题：用户输入触发的 agent round 和高风险工具/安全拦截。
   - 备选方案：全量覆盖所有 runtime event。未采用原因：范围过大，容易演变成无终点重构。

4. 复用现有 data hygiene 工具做脱敏。

   - 选择原因：项目已经有统一 secret-like 脱敏与 hidden control 清理，audit 不应重复定义一套规则。
   - 备选方案：audit 自己维护脱敏规则。未采用原因：安全规则分叉会造成漏网。

## Risks / Trade-offs

- [Risk] 审计文件增长。→ Mitigation：v1 纳入 retention，后续扩展压缩/轮转。
- [Risk] 事件覆盖不完整。→ Mitigation：明确 v1 覆盖面，后续按 OpenSpec 小步扩展。
- [Risk] 审计 payload 意外包含敏感值。→ Mitigation：store 层统一脱敏，并用单测直接读取落盘文件验证。
