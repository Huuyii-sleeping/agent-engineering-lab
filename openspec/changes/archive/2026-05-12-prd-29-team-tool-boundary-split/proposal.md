## Why

`tools/team.ts` 同时包含队友注册、消息投递、协议请求跟踪、inbox 持久化、schema 兼容读取和 public handlers。这个文件已经成为团队通信能力的聚合点，后续一旦调整协议状态或持久化格式，很容易误碰工具对外契约。

本轮只拆内部边界，不改变团队通信语义。

## What Changes

- 新增 team 类型与通用 JSON 边界。
- 新增 team store 边界，承接 teammates / requests / inbox 持久化。
- 新增 team protocol 边界，承接 request id、状态流转、消息构造与兼容读取。
- 新增 team manager 边界，承接 init、通知缓冲、对外流程编排。
- 更新 `tools/team.ts` 为 tool schema 与 public handler facade。
- 新增学习沉淀文档。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `production-runtime-architecture`: 增加 team 工具内部必须区分 store、protocol、manager 与 facade 的要求。
- `team-communication-protocol`: 明确 team tool 的状态、持久化与入口边界不变。
- `architecture-learning-knowledge-base`: 继续要求本轮边界校正沉淀中文学习文档。

## Impact

- 影响代码：
  - `apps/agent-cli/src/tools/team-types.ts`
  - `apps/agent-cli/src/tools/team-store.ts`
  - `apps/agent-cli/src/tools/team-protocol.ts`
  - `apps/agent-cli/src/tools/team-manager.ts`
  - `apps/agent-cli/src/tools/team.ts`
  - focused team tests
- 影响文档：
  - 新增 `PRD-29`
  - 新增 OpenSpec change
  - 新增学习沉淀文档
- 不改变用户可见 CLI、协议请求语义、消息写入格式、schemaVersion 或 inbox 行为。
