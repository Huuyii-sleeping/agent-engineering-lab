# PRD-29 Team 工具模块边界收口

## 背景

`apps/agent-cli/src/tools/team.ts` 已经同时承载 team tool schema、teammate store、request store、inbox 写入、protocol request/response、通知缓冲和 public handlers。Team 是多代理协作的核心状态面，后续继续扩展协议时，需要先把内部边界拆清楚。

## 目标

- 拆出 team types / JSON helper。
- 拆出 team store，承接 teammates、requests、inbox 持久化与旧结构兼容读取。
- 拆出 team protocol，承接 request id、request/response 状态流转和 message 构造语义。
- 拆出 team manager，承接 init、notifications 和流程编排。
- 收窄 `tools/team.ts` 为 tool schema 与 public handler facade。
- 补 focused tests 与中文学习沉淀文档。

## 非目标

- 不改变 `TEAM_SCHEMA_VERSION`。
- 不改变 `.team/teammates.json`、`.team/requests.json`、`.team/inbox/*.jsonl` 格式。
- 不改变 tool schema、handler 导出、错误码或 JSON 输出 shape。
- 不改变 `pending/approved/rejected` 状态流转语义。

## 验收标准

1. `tools/team.ts` 不再直接承载 store、protocol 和 manager 细节。
2. focused tests 覆盖：
   - teammate 兼容读取与状态更新。
   - direct / broadcast message 写入 inbox。
   - shutdown / plan approval request 与 response 流转。
   - notification drain 行为。
3. 原有 PRD-13 team smoke 行为保持通过。
4. `pnpm --filter agent-cli build` 通过。
5. `openspec validate --all --strict` 通过。
6. 新增学习沉淀文档记录本轮采纳与暂不采纳内容。
