# Runtime 剩余编排边界总收口

## 这次真正学到的东西
### 1. 剩余收口不能再按文件大小判断，而要按变化轴判断

PRD-36 到 PRD-38 拆完 QueryModel、QueryToolStage、QueryFinalization 后，剩余文件并不都很大：
- `query-engine.ts` 只有一百多行，但承载 round state、trace、loop_start 和 stage 串联。
- `query-notifications.ts` 只有一百多行，但同时处理 scheduled、subagent、background、team 四类通知的格式化和观测。
- `query-runtime.ts` 很短，但把 UserPromptSubmit hook、history 写入和 compact context 绑定放在一起。
- `agent-service.ts` 是服务入口，session record / summary helper 混在 HTTP adapter 里。

这些都不是“必须大拆”的大文件问题，而是“后续变化会往不同方向走”的边界问题。所以本轮把剩余收口合并成一个 PRD，但每一块只移动稳定边界，不重写主流程。

### 2. 合并 PRD 的前提是每个子边界都有清晰非目标

这轮如果没有非目标，很容易把 QueryEngine 拆成过多 runner，或者顺手改通知文案、HTTP route、release check。实际执行时只采纳了四个低风险边界：
- engine round state / loop metadata
- notification formatter / recorder
- user prompt submit
- service session helper

并明确暂不改变：
- query loop stage 顺序
- Stop hook finally 兜底
- notification system message 文案
- notification observability payload
- UserPromptSubmit hook payload
- session summary shape
- HTTP endpoints
- release check 脚本

## 放到本仓库里怎么理解
### 当前已经有的基础

- `query-model.ts` 已是模型请求 orchestration facade
- `query-tools.ts` 已是工具执行阶段 orchestration
- `query-finalization.ts` 已是收尾阶段 public facade
- `query-preparation.ts` 负责 SessionStart、memory、autonomy、scheduler 和 dynamic messages
- `runUserQuery` 是 CLI / HTTP 共享 query runtime 入口
- `AgentService` 是 HTTP service adapter 和 session 管理入口

### 当前最明显的差距

- QueryEngine 的 round 初始化和 loop_start metadata 不可单独测试。
- QueryNotifications 的 formatter 和 recorder 混在 drain orchestration 里。
- QueryRuntime 的 UserPromptSubmit hook 顺序没有独立边界。
- AgentService 的 session helper 混在 service adapter 里。

### 这轮只解决哪些差距

- 这轮要做的：把剩余 runtime 编排边界一次收口，补 focused tests 和文档。
- 这轮不做的：不改变 query loop 行为，不拆 HTTP route，不新增 release check，不重写 QueryEngine stage runner。

## 这轮采纳了什么
### 采纳

- 新增 `query-engine-round.ts`

承接：
- `findLatestUserInput`
- `summarizeQueryLoopInput`
- `beginQueryEngineRound`
- `recordQueryLoopStart`

这样 `query-engine.ts` 继续表达 prepare -> model -> tool -> finalization -> stop 的主流程，round state reset 和 loop_start 观测可以独立测试。

- 新增 `query-notification-formatters.ts`

承接：
- scheduled prompt summary 和 system message
- subagent notification summary 和 system message
- background notification summary 和 system message
- team notification summary 和 system message

这里保持原有文案不变，避免影响动态 system messages。

- 新增 `query-notification-recorders.ts`

承接：
- scheduled notification event
- background notification event
- team notification event

subagent notification 原先没有 observability event，本轮不新增，避免改变观测语义。

- 新增 `query-user-prompt.ts`

承接：
- `UserPromptSubmit` hook payload
- blocked result
- hook system messages 注入
- user prompt history 追加

这样 `query-runtime.ts` 只保留共享 query runtime 入口和 compact runtime context 绑定。

- 新增 `agent-service-sessions.ts`

承接：
- `AgentSessionRecord`
- `createAgentSessionRecord`
- `sortSessionsByCreatedAt`
- `summarizeSession`

这样 `agent-service.ts` 更像 HTTP service adapter，session record shape 和 summary shape 可以单独测试。

- 新增 focused tests

覆盖：
- QueryEngine round reset、latest user 和 loop_start metadata
- notification formatter 文案
- UserPromptSubmit hook 顺序和 blocked 行为
- AgentService session record 和 summary shape

### 暂不采纳

- 暂不拆 QueryEngine stage runner

当前 `query-engine.ts` 的主流程已经是按 prepare / model / tool / finalization / stop 串联。继续拆 runner 会让控制流分散，本轮先只移出 round metadata。

- 暂不拆 HTTP route

`createAgentHttpServer` 当前规模可控，且路由行为和 response shape 是外部接口。没有必要在总收口里扩大 blast radius。

- 暂不新增 release check 脚本

本轮是边界校正，不是发布流水线扩容。验证证据写入交接文档即可。

- 暂不新增 subagent notification event

原逻辑没有为 subagent notification 记录 observability event。新增事件会改变观测面，单独开设计更合适。

## 这轮实际改成了什么

- `query-engine.ts` 复用 `query-engine-round.ts`
- `query-notifications.ts` 复用 formatter / recorder
- `query-runtime.ts` 复用 `query-user-prompt.ts`
- `agent-service.ts` 复用 `agent-service-sessions.ts`
- 新增 focused tests 锁住本轮移动的文案、payload 和状态语义

改完之后，后续变更入口更明确：
- 调整 round state 或 loop_start，优先改 `query-engine-round.ts`
- 调整 notification 文案，优先改 `query-notification-formatters.ts`
- 调整 notification event，优先改 `query-notification-recorders.ts`
- 调整 UserPromptSubmit hook，优先改 `query-user-prompt.ts`
- 调整 session summary，优先改 `agent-service-sessions.ts`

## 下一步最自然的动作
1. 完成 PRD-39 归档后，边界收口主线可以进入最终 release closeout，而不是继续强行拆小文件。
2. 如果后续要改 QueryEngine 控制流，比如取消、并发工具或多轮 planner，应单独开行为 PRD。
3. 如果要扩展 HTTP API 或 release check，也应单独开产品化 / 发布 PRD。
