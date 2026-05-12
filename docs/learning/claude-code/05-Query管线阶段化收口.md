# Query 管线阶段化收口

## 这组改造真正学到的东西

### 1. `agent-loop.ts` 的问题不只是“文件太长”，而是 query round 的阶段还没被承认出来

这组改造回头看，其实一直在做同一件事：把原来堆在 `agent-loop.ts` 里的职责，逐步还原成 query round 的正式阶段。

先后被识别出来的边界包括：

- 通知与动态 system messages
- tool result helper
- round preparation
- model request / recovery
- tool loop
- finalization

只有这些阶段都显式化之后，query core 才真的开始像 pipeline，而不是一段很长的 orchestration 函数。

### 2. 渐进式阶段化比“一口气重写 QueryEngine”更稳

这组改造很重要的一点是，没有上来就硬写一个完整 `QueryEngine` 类，而是按稳定度逐步抽：

- 先拆横切通知
- 再拆工具结果辅助逻辑
- 再拆 preparation
- 再拆 model stage
- 再拆 tool stage
- 最后拆 finalization

这样做的收益很明确：

- 每一刀边界都相对清楚
- 测试面更容易跟上
- 主循环会持续变薄，而不是先经历一次高风险重写

### 3. query runtime 的阶段化，不只是为了好看，而是为了让 orchestrator 只做真正该做的事

这一组做完之后，query 主循环越来越接近只负责：

- 维护 loop 生命周期
- 串联各阶段
- 处理阶段间早退

这意味着主循环终于开始从“实现堆栈”转向“orchestrator 骨架”。

## 这组改造怎么映射到本仓库

### 原来的共同问题

- `agent-loop.ts` 同时承担太多 query round 职责
- 许多辅助逻辑和阶段逻辑混在一起
- query core 还没有正式 pipeline 形态

### 这组实际做的事

1. 新增 `runtime/query-messages.ts`
2. 新增 `runtime/query-notifications.ts`
3. 新增 `runtime/query-tool-results.ts`
4. 新增 `runtime/query-preparation.ts`
5. 新增 `runtime/query-model.ts`
6. 新增 `runtime/query-tools.ts`
7. 新增 `runtime/query-finalization.ts`
8. 让 `agent-loop.ts` 逐步退回更像 orchestrator 的角色
9. 为这些 query stages / helpers 补对应单测

## 这组里每个阶段分别解决了什么

### 通知与 message helpers

解决的问题：

- scheduled / subagent / background / team 通知都堆在主循环里
- query 相关 message helper 还在多处重复

落地后：

- 多来源通知收集与动态 system message 组装有了单独归属
- `appendSystemMessages(...)` / `findLastAssistantText(...)` 进入共享 helper

### tool result helpers

解决的问题：

- tool output 分析、task id 解析、write side effect、todo 完成判断都混在主循环里

落地后：

- 工具执行后的状态更新辅助逻辑有了单独边界
- 为完整 tool stage 抽离提前清路

### preparation

解决的问题：

- SessionStart hook、memory、autonomy、scheduler、dynamic prompt 组装都堆在 query round 开头

落地后：

- `prepareQueryRound(...)` 开始承担正式前置阶段职责
- 主循环更接近“准备 -> 模型 -> 工具 -> 收尾”

### model stage

解决的问题：

- prompt envelope、compact、budget、fallback、continue、backoff 全压在主循环里

落地后：

- `requestQueryModel(...)` 成为正式模型阶段
- recovery 不再散落在大循环里

### tool stage

解决的问题：

- tool hook、执行、观测、消息回写、task/todo 状态联动都直接串在主循环里

落地后：

- `runQueryToolStage(...)` 成为正式工具阶段
- query 工具编排和单工具执行边界开始清楚分层

### finalization

解决的问题：

- assistant-only round 计数、auto delivery、Stop hook 还像尾巴逻辑

落地后：

- `finalizeAssistantOnlyRound(...)`
- `finalizeToolDrivenRound(...)`
- `runQueryStopStage(...)`

共同组成正式 finalization 边界

## 这组改造采纳了什么

### 采纳

- 把 query round 按阶段逐步显式化
- 先拆稳定小块，再拆厚主链
- 让主循环持续骨架化，而不是一次性重写

### 暂不采纳

- 这一组里还没有直接落完整 `QueryEngine` 对象
- 还没有回头做更系统的第二轮边界校正
- 还没有把 query 周边 service 依赖一起纳入正式装配

原因是这组目标是先把 query pipeline 的阶段边界收出来。

## 到这里就先停

完成这组之后，query core 已经从：

- 一大段混合逻辑

推进到：

- notifications / helpers
- preparation
- model stage
- tool stage
- finalization

下一步更自然的方向是：

- 让这些阶段开始真正挂到显式 `QueryEngine`
- 再继续收围绕 `QueryEngine` 的 service 依赖
