# Security 工具模块边界收口

## 这次真正学到的东西

### 1. 横切安全逻辑要先分清规则、状态和入口

`tools/security.ts` 原来同时承载 policy、approval store、audit、gate 和 tool facade。安全模块是所有工具执行链路都会经过的横切能力，如果这些职责继续混在一起，后续调默认规则或审批流程时，很容易顺手碰到对外工具契约。

这轮拆分的核心不是改安全策略，而是把变化原因分开：

- policy 变化：默认规则、merge、match、evaluate。
- approval 持久化变化：审批记录 load/save/normalize。
- manager 编排变化：init、audit、审批状态流转、gate。
- facade 变化：tool schema 与 public handler。

### 2. 行为不变时，测试要盯住状态机和输出 shape

Security 的风险不在“能不能拆出文件”，而在拆分时改掉审批语义。最需要守住的是：

- `SECURITY_POLICY_DENY` / `SECURITY_APPROVAL_REQUIRED` 等错误码。
- 默认 rule 的命中顺序和 risk/reason。
- approval 从 `pending` 到 `approved`、再到 `consumed` 的一次性消费语义。
- `.security/approvals.json` 仍是数组，`.audit/security_events.jsonl` 仍按原事件 shape 写入。

因此本轮 focused tests 没有只测模块存在，而是覆盖了默认策略、merge、approval normalize/store、request/approve/gate consume 和 audit event。

## 放到本仓库里怎么看

### 当前已经有的基础

- tool runtime 已经在执行 handler 前调用 `enforceSecurityGate`。
- replay dry-run 已经先于 security approval 逻辑阻断写操作。
- MCP integration test 已经覆盖外部 MCP 工具必须先申请 approval。
- `.security/policy.json` 和 `.security/approvals.json` 已经是稳定运行时文件格式。

### 当前最明显的差距

- `tools/security.ts` 同时包含 policy、approval store、manager 和 facade。
- 默认策略调整和审批持久化调整没有清晰修改入口。
- 安全模块缺少直接 focused unit tests，主要靠 MCP integration path 间接兜底。

### 这轮只解决哪些差距

- 这轮要做的：拆 Security 内部边界，补 focused tests，沉淀文档。
- 这轮不做的：不改默认 policy，不改 approval 状态机，不改 audit event，不改 `enforceSecurityGate` 契约。

## 这轮采纳了什么

### 采纳

- 新增 `security-types.ts`

集中放共享类型和 JSON helper：

- `RiskLevel` / `Decision` / `ApprovalRequest`
- `PolicyConfig` / `PolicyDecision` / `SecurityGateResult`
- `ok` / `fail` / `safeJsonParse` / `parseArgsJson`

- 新增 `security-policy.ts`

承接纯 policy 语义：

- 默认 policy
- policy merge
- rule match
- evaluate

这样后续调整默认规则或规则匹配时，优先改 policy 边界。

- 新增 `security-approvals.ts`

承接 approval store：

- approval 记录归一化
- approvals 文件 load
- approvals 文件 save

状态流转没有放进 store，因为 approve/reject/consume 需要 audit 和 gate 语义，仍由 manager 编排。

- 新增 `security-manager.ts`

承接运行时编排：

- `.security` / `.audit` 初始化
- policy cache 和 reload
- audit 写入
- approval create/approve/reject/list/consume
- check 与 gate

- 收窄 `tools/security.ts`

现在 `tools/security.ts` 只保留：

- `SECURITY_TOOLS`
- 默认 `SecurityManager` 实例
- `runSecurity*` public handlers
- `enforceSecurityGate`

### 暂不采纳

- 暂不改变默认策略规则

本轮目标是边界收口，默认 deny/approval/allow 语义保持不变。

- 暂不把 approve/reject/consume 放进 approval store

这些操作不只是文件状态变更，还涉及 audit 和 gate scope，放在 manager 更符合当前职责划分。

- 暂不改变 policy 文件读取归属

policy 文件初始化、路径和 cache 是 manager 的运行时组合职责，policy 模块保持纯规则逻辑，便于单测。

## 这轮实际改成了什么

- `security-types.ts` 承接共享类型与 JSON helper。
- `security-policy.ts` 承接默认规则、merge、match 和 evaluate。
- `security-approvals.ts` 承接 approval normalize/load/save。
- `security-manager.ts` 承接 init、audit、policy cache、approval workflow 和 gate。
- `security.ts` 收成 tool schema 与 public handler facade。
- focused tests 覆盖 policy、approval store、manager，以及原 runtime/MCP 路径。

改完之后，后续变更入口更明确：

- 调整默认规则或匹配逻辑，优先改 `security-policy.ts`。
- 调整 approval 文件格式兼容或归一化，优先改 `security-approvals.ts`。
- 调整审批状态流转、audit 或 gate，优先改 `security-manager.ts`。
- 调整 tool schema 或 public handler，才改 `security.ts`。

## 下一步最自然的动作

1. 观察 `SecurityManager` 后续是否继续增长，如果增长，再拆 approval workflow 与 gate runner。
2. 为 `.security/policy.json` 增加显式 schema validation 和用户可读错误报告。
3. 继续检查 `team.ts`、`worktree.ts` 等大工具模块，按同样方式收口内部边界。
