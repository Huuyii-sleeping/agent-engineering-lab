## Why

`tools/security.ts` 是 tool execution 的关键保护层，但当前同时包含 policy、approval store、audit、gate、tool schema 与 public handlers。继续聚在一个文件，会让后续调整 policy 或审批流程时更容易误碰工具对外契约。

本轮只拆内部边界，不改变安全行为。

## What Changes

- 新增 security 类型与 JSON 输出工具边界。
- 新增 security policy 模块，承接默认规则、policy merge、rule match 与 evaluate。
- 新增 approval store 模块，承接 approval load/save/normalize。
- 新增 security manager 模块，承接 init、audit、approval workflow 与 gate。
- 更新 `tools/security.ts` 为 tool schema 与 handler facade。
- 新增学习沉淀文档。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `production-runtime-architecture`: 增加 security 工具内部必须区分 policy、approval store、manager 与 tool facade 的要求。
- `architecture-learning-knowledge-base`: 继续要求本轮边界校正沉淀中文学习文档。

## Impact

- 影响代码：
  - `apps/agent-cli/src/tools/security-types.ts`
  - `apps/agent-cli/src/tools/security-policy.ts`
  - `apps/agent-cli/src/tools/security-approvals.ts`
  - `apps/agent-cli/src/tools/security-manager.ts`
  - `apps/agent-cli/src/tools/security.ts`
  - focused security tests
- 影响文档：
  - 新增 `PRD-28`
  - 新增 OpenSpec change
  - 新增学习沉淀文档
- 不改变用户可见 CLI、HTTP API、工具 schema、安全输出、审批或 audit 行为。
