## Context

当前 `tools/security.ts` 的职责包括：

- security tool schemas
- 默认 policy 规则
- policy 文件初始化、读取、合并和缓存
- approval 文件读取、归一化和保存
- approval 创建、审批、拒绝、消费、过期
- policy decision 与 gate
- audit event 写入
- public run handlers

security 是所有 tool execution 的关键横切能力，后续很可能继续扩展策略、审批和审计。因此需要先把内部边界拆清楚。

## Goals / Non-Goals

**Goals:**

- 拆出 policy 边界。
- 拆出 approval store 边界。
- 拆出 manager 边界。
- 让 `tools/security.ts` 只做 tool schema 与 public handler facade。
- 保持安全行为兼容。

**Non-Goals:**

- 不改变默认 policy。
- 不改变 approval 状态机。
- 不改变 audit event type/payload。
- 不改变 `enforceSecurityGate` 的调用契约。

## Decisions

### Decision 1: 新增 `security-types.ts`

采纳：

- 集中 RiskLevel、Decision、ApprovalRequest、PolicyConfig、PolicyDecision、SecurityGateResult 等类型。
- 集中 `ok`、`fail`、`safeJsonParse`、`parseArgsJson` 这类稳定 JSON 工具。

备选方案：

- 每个模块各自定义类型。

不采用原因：

- policy、approval store、manager 和 facade 都需要共享这些类型；分散定义容易出现输出 shape 漂移。

### Decision 2: 新增 `security-policy.ts`

采纳：

- 承接默认 policy、policy merge、rule match 和 evaluate。
- policy 文件读取仍由 manager 负责，policy 模块保持纯逻辑为主。

备选方案：

- 让 policy 模块直接读写 `.security/policy.json`。

不采用原因：

- init、路径和 audit 属于 manager 组合职责；policy 模块专注规则语义更容易测试。

### Decision 3: 新增 `SecurityApprovalStore`

采纳：

- approval store 只负责 approval 文件 load/save/normalize。
- 状态变更仍由 manager 编排。

备选方案：

- approval store 同时负责 approve/reject/consume。

不采用原因：

- approve/reject/consume 需要 audit 和 policy scope 语义，放 manager 更清晰。

### Decision 4: 新增 `SecurityManager`

采纳：

- manager 负责 init、audit、policy cache、approval workflow 和 gate。
- `tools/security.ts` 持有默认 manager 并导出 public handlers。

备选方案：

- 保留原 `SecurityManager` 在 `tools/security.ts`。

不采用原因：

- `tools/security.ts` 应与其他工具 facade 一样，只表达工具 schema 和对外函数。

## Risks / Trade-offs

- [Risk] 迁移 policy merge 时改变默认规则顺序 → Mitigation：focused tests 覆盖默认 policy merge。
- [Risk] approval 状态流转输出变化 → Mitigation：focused tests 覆盖 request/approve/gate consume。
- [Risk] audit 初始化路径变化 → Mitigation：manager 保留原 `.security` / `.audit` 路径逻辑。
