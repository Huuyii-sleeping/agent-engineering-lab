## Context

当前 `tools/team.ts` 承担的职责包括：

- teammates 注册与状态更新
- direct message / broadcast 投递
- shutdown / plan approval protocol request tracking
- requests / inbox 持久化
- old shape 兼容读取
- public tool schemas 和 handlers

Team 是多代理协作最直接的状态面之一，后续很可能继续增加团队级协议与通知逻辑。因此需要先把内部边界拆清楚。

## Goals / Non-Goals

**Goals:**

- 拆出 team store 边界。
- 拆出 team protocol 边界。
- 拆出 team manager 边界。
- 让 `tools/team.ts` 只做 tool schema 与 public handler facade。
- 保持 team 行为兼容。

**Non-Goals:**

- 不改变 teammates / requests schemaVersion。
- 不改变消息投递格式或 inbox 文件格式。
- 不改变 request_id 与状态流转语义。

## Decisions

### Decision 1: 新增 `team-types.ts`

采纳：

- 集中 Teammate、TeamMessage、TeamRequest、TeamNotification、ProtocolType 等共享类型。
- 集中稳定 JSON helper 和 request id 生成函数。

备选方案：

- 每个模块各自定义类型。

不采用原因：

- store、protocol、manager 与 facade 都需要共享这些类型；分散定义会增加 shape 漂移风险。

### Decision 2: 新增 `team-store.ts`

采纳：

- store 只负责 teammates / requests / inbox 的 load、save、append。
- 兼容旧结构读取留在 store 层处理。

备选方案：

- 让 store 同时负责 protocol 状态流转。

不采用原因：

- 状态流转需要和消息构造、通知与兼容读取一起编排，放 manager/protocol 更清晰。

### Decision 3: 新增 `team-protocol.ts`

采纳：

- protocol 承接 request 创建、响应、message 构造和状态流转语义。
- protocol 不直接处理文件路径和聚合装配。

备选方案：

- 将 protocol 逻辑留在 manager。

不采用原因：

- protocol 是稳定的业务语义边界，单独分离更便于测试 request/response 规则。

### Decision 4: 新增 `TeamManager`

采纳：

- manager 负责 init、notifications buffer、对外流程编排与 facade 连接。
- `tools/team.ts` 持有默认 manager 并导出 public handlers。

备选方案：

- 保留 `TeamManager` 在 `tools/team.ts`。

不采用原因：

- `tools/team.ts` 应与其他工具 facade 一样，只表达工具 schema 和对外函数。

## Risks / Trade-offs

- [Risk] 队友 / 请求旧记录兼容读取时补版本行为变化 → Mitigation：focused tests 覆盖 old shape load。
- [Risk] inbox 消息构造字段变化 → Mitigation：focused tests 覆盖 direct/broadcast/protocol message shape。
- [Risk] request 状态流转或通知回放变化 → Mitigation：focused tests 覆盖 request/response/list/read flow。
