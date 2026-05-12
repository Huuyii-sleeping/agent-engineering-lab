# Team 工具模块边界收口

## 这次真正学到的东西

### 1. 协作协议要把持久化和语义拆开

`tools/team.ts` 原来把队友注册、inbox 写入、协议请求状态流转、通知缓冲和 tool facade 放在一起。Team 能力和 Security 类似，都是工具运行时的横切状态面：它不只是一个工具列表，而是一组会持续扩展的协作协议。

这轮最重要的拆分是：

- store 负责文件结构。
- protocol 负责 request / response 语义。
- manager 负责流程编排。
- facade 负责 tool schema 和 public handlers。

这样后续调整 `.team` 文件兼容读取时，不需要碰 protocol；调整 shutdown 或 plan approval 语义时，也不用改 tool schema。

### 2. 行为不变时，要守住消息 shape 和状态流转

Team 拆分的风险主要在两个地方：

- inbox 是 jsonl，消息字段必须保持稳定。
- request_id 关联 request 和 response，`pending -> approved/rejected` 语义不能漂移。

因此本轮 focused tests 覆盖了：

- 旧 teammate / request 记录兼容读取。
- direct message 和 broadcast 写入 inbox。
- shutdown request / response。
- plan approval request / response。
- notification drain 一次性消费。

## 放到本仓库里怎么看

### 当前已经有的基础

- `team-communication-protocol` spec 已经定义了队友管理、消息投递、请求跟踪和 inbox 查询。
- `runtime/query-notifications.ts` 已经会读取 team notifications 并写入提醒事件。
- PRD-13 smoke 已经覆盖 team schemaVersion 基线。

### 当前最明显的差距

- `tools/team.ts` 同时承载 store、protocol、manager 和 facade。
- team 行为主要靠烟测兜底，缺少直接覆盖协议状态和 inbox shape 的 focused tests。
- 后续新增团队协议时，没有清晰的修改入口。

### 这轮只解决哪些差距

- 这轮要做的：拆 Team 内部边界，补 focused tests，沉淀文档。
- 这轮不做的：不改 `.team` 文件格式，不改 request 状态机，不改 tool schema，不改通知汇总逻辑。

## 这轮采纳了什么

### 采纳

- 新增 `team-types.ts`

集中放共享类型、`TEAM_SCHEMA_VERSION`、`makeRequestId`、`ok` 和 `fail`。

- 新增 `team-store.ts`

承接持久化边界：

- `.team/teammates.json`
- `.team/requests.json`
- `.team/inbox/*.jsonl`
- 旧结构兼容读取

- 新增 `team-protocol.ts`

承接协议语义：

- direct / broadcast message 构造
- protocol request 构造
- request response 状态流转
- response message 构造

- 新增 `team-manager.ts`

承接运行时编排：

- teammate add / status
- message / broadcast
- shutdown / plan approval flow
- notification buffer

- 收窄 `tools/team.ts`

现在 `tools/team.ts` 只保留：

- `TEAM_TOOLS`
- 默认 `TeamManager` 实例
- `runTeam*` public handlers
- `TeamNotification` 兼容类型导出

### 暂不采纳

- 暂不改变 `Boolean(approveArg)` 行为

原实现对非空字符串会判定为 true。虽然这不是最理想的输入语义，但本轮是边界拆分，不改变已有行为。

- 暂不把 notifications 做成持久化队列

当前 notifications 是运行时缓冲，query notifications 会 drain。是否持久化是新能力，不放进本轮。

- 暂不把 Team 接入 service 目录

Team 仍是工具层内部能力，本轮只拆工具模块边界，不迁移到 runtime services。

## 这轮实际改成了什么

- `team-types.ts` 承接共享类型与 JSON helper。
- `team-store.ts` 承接 `.team` 文件初始化、读取、保存和 inbox 写入。
- `team-protocol.ts` 承接消息构造和 request 状态流转。
- `team-manager.ts` 承接对外流程编排与 notification drain。
- `team.ts` 收成 tool schema 与 public handler facade。
- focused tests 覆盖 store、manager 和原 query notification path。

改完之后，后续变更入口更明确：

- 调整 `.team` 持久化兼容，优先改 `team-store.ts`。
- 调整 request/response 语义，优先改 `team-protocol.ts`。
- 调整流程编排和 notifications，优先改 `team-manager.ts`。
- 调整 tool schema 或 public handler，才改 `team.ts`。

## 下一步最自然的动作

1. 继续检查 `worktree.ts` 的记录 store、git runner、closeout manager 是否需要拆分。
2. 评估 Team notifications 是否需要持久化与可回放。
3. 为 `team_approval` 类协议增加更明确的输入校验，但单独开行为变更 PRD。
