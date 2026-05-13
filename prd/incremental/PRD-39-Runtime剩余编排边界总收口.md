# PRD-39 Runtime 剩余编排边界总收口

## 背景

PRD-36 到 PRD-38 已经完成 QueryModel、QueryToolStage、QueryFinalization 三个 query runtime 阶段收口。剩余最明显的聚合点集中在：

- `runtime/query-engine.ts`：主循环编排、round 初始化、loop_start 观测、stage 串联和 stop stage 兜底。
- `runtime/query-notifications.ts`：通知 drain、按来源格式化、console 输出和 observability 记录混在同一文件。
- `runtime/query-runtime.ts`：UserPromptSubmit hook、system message 注入、用户消息追加、compact context 绑定和 QueryEngine 调用混在一个函数里。
- `agent-service.ts` / `agent-loop.ts`：顶层入口已经较薄，但 session record / summary helper 仍可独立出来，便于 HTTP service 保持适配层定位。

用户要求后续收口不要拆成多个 PRD，本轮合并成一次总收口执行。

## 目标

- 拆出 QueryEngine round state / loop metadata 边界，降低 `query-engine.ts` 编排噪音。
- 拆出 QueryNotifications formatter / recorder 边界，保持通知文案与事件语义不变。
- 拆出 QueryRuntime user prompt submit 边界，保持 hook blocked 与 compact runtime context 语义不变。
- 拆出 AgentService session helper 边界，保持 session isolation 和 HTTP response shape 不变。
- 补 focused tests 覆盖新增边界。
- 新增学习沉淀文档，记录本轮合并收口的采纳和暂不采纳内容。
- 更新当前对话交接文档。

## 非目标

- 不改变 `QueryEngine.run` public contract。
- 不改变模型请求、工具执行、finalization、Stop hook 或 delivery 行为。
- 不改变 notification system message 文案和 observability payload。
- 不改变 `UserPromptSubmit` hook payload、blocked error shape 或 history 写入顺序。
- 不改变 AgentService HTTP endpoints、session summary shape 或 busy guard。
- 不新增 release check 脚本，不扩大验证成本。

## 验收标准

1. `query-engine.ts` 只保留主阶段串联，不直接承载 round state 初始化和 latest user 摘要细节。
2. `query-notifications.ts` 只保留 drain orchestration，不直接承载所有来源的 formatter 和 recorder 细节。
3. `query-runtime.ts` 只保留共享 query runtime 入口，不直接承载 UserPromptSubmit 的全部细节。
4. `agent-service.ts` 复用 session helper，HTTP 和 chat 行为保持兼容。
5. focused tests、build、OpenSpec strict、diff check 通过。
6. OpenSpec change 归档，学习沉淀和交接文档同步更新。
