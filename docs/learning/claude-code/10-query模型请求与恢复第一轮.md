# 第十轮学习沉淀：query 模型请求与恢复第一轮

## 这轮真正学到的东西

### 1. `agent-loop.ts` 里最重的一段，不是工具执行，而是“请求模型前后那条恢复主链”

前一轮把 query 准备阶段抽出去之后，主循环里最厚的一段就只剩下两块：

- model request / model policy / compact / fallback / continue / backoff / fail
- tool loop

真正影响主循环可读性的，先是前者。因为这条链不仅长，而且有多种恢复分支。

### 2. recovery 不是零散异常处理，而是 query stage 里的稳定子边界

这轮把模型请求和恢复主链抽到 `requestQueryModel(...)` 之后，结构更清楚了：

- 准备阶段负责给 query round 产出上下文
- 模型阶段负责构造请求、调用模型、处理 budget policy、fallback 和 recovery
- 主循环只消费“这轮模型阶段最终产出了什么”

这说明 recovery 不应该继续散落在大循环里，它本身就是 query pipeline 里的正式阶段。

### 3. 抽掉 recovery 主链后，主循环开始真正接近骨架

这一刀完成后，`agent-loop.ts` 已经更像：

- loop start
- prepare round
- request model
- execute tools
- auto delivery
- stop hook

这比之前更接近明确的 QueryEngine / query pipeline 形态。

## 这轮怎么映射到本仓库

### 原来的问题

- `agent-loop.ts` 直接承担 prompt envelope、token 预估、compact、continue、fallback、backoff 和失败收尾
- recovery 逻辑虽然已经有 `recovery.ts`，但 orchestration 还留在主循环
- query 核心还没真正分出“模型阶段”

### 这轮实际做的事

1. 新增 `runtime/query-model.ts`
2. 抽出 `requestQueryModel(...)`
3. 让模型阶段统一负责：
   - prompt envelope 组装
   - preflight token estimate
   - budget policy
   - model fallback
   - truncated output continuation
   - compact / backoff / fail
4. 补 `query-model` 单测

## 本轮采纳了什么

### 采纳

- 把 model request + recovery 视为独立 query stage
- 让主循环只依赖阶段结果，不再直接编排所有恢复分支
- 优先抽 orchestration，而不是先改具体恢复策略

### 暂不采纳

- 还没有继续拆 tool loop
- 还没有把 auto delivery follow-up 从主循环拿出去
- 还没有引入完整的 query engine class

原因是这一轮先处理主循环里最复杂、最容易扩散的一段。

## 到这里就先停

这轮完成后，主循环的 query 骨架更清楚了。下一步最自然的，就是把剩下的 tool loop stage 再收出来。
