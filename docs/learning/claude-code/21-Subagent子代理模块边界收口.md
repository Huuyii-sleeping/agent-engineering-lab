# Subagent 子代理模块边界收口

## 这次真正学到的东西
### 1. subagent 不是“多几个 tool handlers”，而是一个完整的异步执行状态面

`tools/subagent.ts` 原来同时负责：
- `subagent_*` tool schema
- agent record map / running jobs
- spawn / send / wait / close 生命周期
- model policy 选择、budget deny 与 fallback
- tool-calling 循环
- 完成/失败通知与 observability

这说明它本质上不是一个简单的工具声明文件，而是“生命周期状态面 + 模型执行面 + 通知回流”叠在一起的执行模块。继续堆在一个文件里，后续只要改模型策略、tool loop 或 wait 语义，就很容易连带碰坏 facade。

### 2. 这块最自然的边界是 types / executor / manager / facade

这一轮拆完之后，内部层次清楚很多：
- `subagent-types.ts`
  - 放 `SubagentStatus`、`SubagentRecord`、`SubagentNotification`
  - 放执行结果类型和 `ok/err/snapshot` helper
- `subagent-executor.ts`
  - 放 OpenAI client 懒加载
  - 放 model policy 选择、budget deny、fallback
  - 放 tool-calling 循环和 base tool 执行
- `subagent-manager.ts`
  - 放 agent record map、running jobs、notification queue
  - 放 spawn / list / send / wait / close
  - 放 completed / failed 状态回写与 observability
- `subagent.ts`
  - 只保留 tool schema、默认 manager 和兼容导出 facade

这样后续如果要改模型执行策略，优先改 executor；如果要改生命周期或通知，优先改 manager；如果只调外部契约，再改 facade。

## 放到本仓库里怎么理解
### 当前已经有的基础

- `subagent-collaboration` spec 已经定义了子代理生命周期工具、通知和错误契约
- `subagent-tool-execution` spec 已经定义了 base tools、tool loop、禁止递归 subagent 和安全边界
- query notification service 已经会把 subagent notifications 注入主循环
- 统一 model policy 已经负责预算守卫与 fallback

### 当前最明显的差距

- `subagent.ts` 仍然把生命周期状态面和模型执行循环混写
- 没有 focused tests 锁定 wait timeout、busy/closed 错误和 tool loop 行为
- 通知与 observability 逻辑依附在大文件里，后续改动风险偏高

### 这轮只解决哪些差距

- 这轮要做的：拆 `Subagent` 内部边界，补 focused tests，新增沉淀文档
- 这轮不做的：不引入持久化，不引入取消执行，不扩大工具白名单，不再继续拆 notification store

## 这轮采纳了什么
### 采纳

- 新增 `subagent-types.ts`

集中承接：
- `SubagentStatus`
- `SubagentRecord`
- `SubagentNotification`
- `SubagentExecutionResult`
- `ok` / `err` / `subagentSnapshot`

- 新增 `subagent-executor.ts`

承接执行面边界：
- client 懒加载
- model select / budget deny / fallback
- base tool loop
- usage finalize

- 新增 `subagent-manager.ts`

承接运行时编排：
- agent map / running jobs / notification queue
- spawn / list / send / wait / close
- completed / failed 状态回写
- observability notification

- 收窄 `subagent.ts`

现在 `subagent.ts` 只保留：
- `SUBAGENT_TOOLS`
- 默认 `SubagentManager`
- `runSubagentSpawn`
- `runSubagentSend`
- `runSubagentWait`
- `runSubagentList`
- `runSubagentClose`
- `drainSubagentNotifications`

- 新增 focused tests

覆盖：
- manager 生命周期、busy/closed/not found/timeout 语义
- notification drain
- executor 的无工具完成、tool-calling 循环、budget deny 与 fallback

### 暂不采纳

- 暂不引入持久化

当前子代理仍然是会话内 in-memory 生命周期。是否需要跨重启恢复，是单独的运行时能力问题，不应该在这轮边界收口里顺手塞进来。

- 暂不引入取消执行

`subagent_close` 目前仍然只允许关闭非 running agent，没有扩展成取消任务。取消语义会牵涉模型请求中断、状态机与通知定义，适合独立一轮讨论。

- 暂不继续拆 notification store

当前 notification queue 和生命周期状态仍然是同一类运行时职责，继续细拆会先增加协调成本，不一定立刻带来收益。

## 这轮实际改成了什么
- `subagent-types.ts` 承接共享类型与 JSON helper
- `subagent-executor.ts` 承接模型执行、fallback 与 base tool loop
- `subagent-manager.ts` 承接生命周期、wait、通知和 observability
- `subagent.ts` 收成 tool schema 与兼容导出 facade
- 新增 `subagent-manager.test.ts` 与 `subagent-executor.test.ts`

改完之后，后续变更入口更明确：
- 调整模型策略或 tool loop，优先改 `subagent-executor.ts`
- 调整 lifecycle / wait / notifications，优先改 `subagent-manager.ts`
- 调整外部工具契约，再改 `subagent.ts`

## 下一步最自然的动作
1. 继续看剩余 tools 层还有没有类似的“大状态文件”需要收口。
2. 评估 subagent 是否长期需要 durable persistence 或 cancel 语义。
3. 检查 subagent、background、scheduler 这几类异步通知源，是否未来需要更统一的 notification store。
