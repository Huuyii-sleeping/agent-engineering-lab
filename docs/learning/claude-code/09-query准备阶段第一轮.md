# 第九轮学习沉淀：query 准备阶段第一轮

## 这轮真正学到的东西

### 1. `QueryEngine` 风格的结构，不一定先从“模型调用”开始拆，也可以先从“准备阶段”开始拆

对照架构总览再看当前仓库，会发现 `agent-loop.ts` 里有一整段逻辑其实都属于 query round 的前置准备：

- SessionStart hook
- memory auto extract
- autonomy tick
- scheduler tick
- dynamic system messages 收集
- memory injection

这些逻辑并不直接等于“调用模型”，但它们又确实是 query round 的标准前置阶段。

### 2. 先把 round preparation 抽出来，主循环就更像 query 骨架

这轮没有继续碰 recovery 主链，而是先把上面这段前置逻辑收成 `prepareQueryRound(...)`。

这样之后：

- `agent-loop.ts` 少了一大段前置准备代码
- 主循环更接近“准备 -> 请求模型 -> 执行工具 -> 收尾”
- query runtime 的阶段感开始更明确

### 3. 当前仓库离架构总览的目标又近了一步，但还没结束

到这一步，我们已经把这些东西逐步从大循环里抽出来了：

- message helper
- notification collection
- tool result helper
- round preparation

这说明路径是对的，但还没有到完整 QueryEngine / query pipeline 的终点。后面仍然可以继续拆：

- model request / recovery 主链
- tool loop stage
- auto delivery follow-up

## 这轮怎么映射到本仓库

### 原来的问题

- query 前置准备逻辑都堆在 `agent-loop.ts`
- SessionStart / memory / scheduler / autonomy / dynamic prompt 拼装没有单独归属
- 主循环仍然偏重

### 这轮实际做的事

1. 新增 `runtime/query-preparation.ts`
2. 抽出 `prepareQueryRound(...)`
3. 让 `agent-loop.ts` 通过准备结果构造 prompt envelope
4. 补 `query-preparation` 单测

## 本轮采纳了什么

### 采纳

- 继续按 query stage 渐进式收口
- 把 query 前置准备视为正式阶段
- 让主循环继续往骨架化推进

### 暂不采纳

- 还没有拆 recovery / model request 主链
- 还没有把 tool loop 提成完整 stage
- 还没有处理 auto delivery follow-up

原因是这一轮的目标只是继续沿着架构总览路径，把最稳定的一段前置阶段单独收出来。

## 到这里就先停

这轮完成后，已经继续沿着架构总览的路径前进了一步。下一步最自然的是在你回顾后，再决定继续拆 recovery 还是 tool loop。
