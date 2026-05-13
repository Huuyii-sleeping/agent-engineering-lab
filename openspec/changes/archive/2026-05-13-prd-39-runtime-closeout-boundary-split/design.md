## Context

当前剩余收口点分布在几个较薄但仍聚合多种职责的文件中：

- `query-engine.ts` 同时负责 round state 初始化、latest user 摘要、loop_start event、模型阶段、工具阶段和 finalization 阶段串联。
- `query-notifications.ts` 同时负责 drain 通知、按来源构造 system message、console 输出和 observability event。
- `query-runtime.ts` 同时负责 UserPromptSubmit hook、history 写入、compact runtime context 和 query engine 调用。
- `agent-service.ts` 同时负责 HTTP service、session record shape、session summary 和 chat adapter。

## Goals / Non-Goals

**Goals:**

- 合并完成剩余 runtime closeout 边界拆分。
- 让主流程文件更偏 orchestration / adapter。
- 用 focused tests 锁住拆分后容易漂移的文案、payload 和状态语义。
- 完成文档沉淀、OpenSpec 归档和本地 commit。

**Non-Goals:**

- 不改变 query loop 的 while / return 行为。
- 不改变 notification 文案、console 输出或 observability payload。
- 不改变 UserPromptSubmit hook payload 或 blocked error shape。
- 不改变 AgentService endpoints、session summary 或 busy guard。
- 不改变 release check 脚本入口。

## Decisions

### Decision 1: 新增 `query-engine-round.ts`

采纳：

- 承接 latest user 查找、输入摘要、round state 初始化和 loop_start event。

不采用：

- 直接把整个 QueryEngine 拆成多个 runner。

原因：

- 当前 QueryEngine 的 stage 串联仍清晰，过度拆 runner 会让控制流分散。本轮只先移出可纯测的 round metadata 和状态初始化。

### Decision 2: 新增 notification formatter / recorder

采纳：

- `query-notification-formatters.ts` 负责 system message 与 console summary 文案。
- `query-notification-recorders.ts` 负责按来源记录 observability event。

不采用：

- 为每个 notification source 建独立 orchestrator 文件。

原因：

- 当前 source 数量有限，formatter / recorder 两类变化轴更稳定。

### Decision 3: 新增 `query-user-prompt.ts`

采纳：

- UserPromptSubmit hook、blocked result、system message 注入和 user message 追加进入独立边界。

不采用：

- 把 compact runtime context 也迁移进去。

原因：

- compact context 是 query runtime 调用作用域，继续留在 `query-runtime.ts` 更符合入口职责。

### Decision 4: 新增 `agent-service-sessions.ts`

采纳：

- session record type、session 创建、summary 和 session 排序 helper 独立出来。

不采用：

- 把 HTTP 路由也拆出。

原因：

- HTTP 路由当前规模可控；本轮目标是让 session state helper 离开 service adapter。

## Risks / Trade-offs

- [Risk] notification 文案漂移 -> Mitigation：formatter tests 覆盖 scheduled/subagent/background/team 文案。
- [Risk] loop_start payload 漂移 -> Mitigation：round helper tests 覆盖 latest user 摘要和 round state reset。
- [Risk] user prompt hook 顺序漂移 -> Mitigation：user prompt tests 覆盖 blocked 和 append 顺序。
- [Risk] session summary shape 漂移 -> Mitigation：session helper tests 覆盖 summary 字段。
