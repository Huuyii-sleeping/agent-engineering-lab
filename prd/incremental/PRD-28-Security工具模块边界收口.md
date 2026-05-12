# PRD-28 Security 工具模块边界收口

## 目标

在 runtime/tools/MCP 主干边界已经收口后，继续处理工具层里的关键横切能力：`tools/security.ts`。当前该文件同时承载 policy 默认规则、policy 加载与合并、approval 持久化、audit、gate 判定、tool schemas 和命令 handler，职责过宽。

本阶段只拆内部模块边界，不改变安全策略默认值、审批流程、错误码、输出 JSON、audit 事件或工具 schema。

## 范围（In Scope）

- 新增 security types/JSON 边界，集中类型与输出格式工具。
- 新增 security policy 边界，承接默认 policy、policy merge、rule match 与 evaluate。
- 新增 security approval store 边界，承接 approval load/save/normalize。
- 新增 security manager 边界，承接 init、audit、approval workflow 与 gate。
- 更新 `tools/security.ts` 为 tool schema 与 public handler facade。
- 更新或新增 focused tests。
- 新增本轮中文学习沉淀文档。

## 非目标（Out of Scope）

- 不改变默认 policy 规则。
- 不改变 `.security/policy.json` 或 `.security/approvals.json` 存储格式。
- 不改变 approval TTL、状态流转、错误码或输出 JSON。
- 不改变 replay dry-run、安全门禁调用顺序或 tool execution 语义。

## 功能要求

- security policy 评估必须由独立模块承载。
- approval 持久化必须由独立 store 承载。
- `SecurityManager` 必须从 `tools/security.ts` 移入独立模块。
- `tools/security.ts` 必须继续导出原有 tool schemas、run 函数和 `enforceSecurityGate`。

## 验收标准（AC）

- AC-28-1：新增 policy/approval/manager 或等效模块。
- AC-28-2：`tools/security.ts` 只保留 tool schema 与 public handler facade。
- AC-28-3：focused security tests、tool-runtime tests、build 和 OpenSpec strict 校验通过。
- AC-28-4：新增中文学习沉淀文档。

## 实施顺序

1. 建立 PRD 与 OpenSpec change。
2. 拆出 security types、policy、approval store、manager。
3. 更新 `tools/security.ts` 与 focused tests。
4. 运行验证，补学习沉淀并归档 change。
