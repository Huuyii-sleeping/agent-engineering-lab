# 第十二轮学习沉淀：query 收尾阶段第一轮

## 这轮真正学到的东西

### 1. `auto delivery` 和 `Stop hook` 不是杂项，而是 query round 的正式收尾阶段

把 model stage 和 tool stage 抽掉之后，`agent-loop.ts` 里最后还剩两段带明显职责的逻辑：

- assistant-only round 的 roundsWithoutTodo 更新
- tool round 之后的 auto delivery follow-up
- Stop hook 的统一收尾

这几段以前容易被看成“尾巴逻辑”，但它们其实都属于 round finalization。

### 2. query pipeline 到这里才算真正闭环

这轮把 finalization 抽出来之后，主循环终于更完整地落成了这条骨架：

- round start
- round preparation
- model stage
- tool stage
- finalization stage

也就是说，query 不只是“准备 + 请求模型 + 执行工具”，还必须包含统一的 round 收尾。

### 3. 继续拆到这一步之后，`agent-loop.ts` 已经更像 orchestrator，而不是实现堆栈

现在 `agent-loop.ts` 的职责已经明显收窄：

- 维护 while-loop 生命周期
- 串联各阶段
- 处理阶段之间的早退路径

这和前面几轮相比，是结构上的实质变化，不只是代码挪位置。

## 这轮怎么映射到本仓库

### 原来的问题

- auto delivery 仍直接塞在 `agent-loop.ts`
- Stop hook 收尾逻辑还挂在 finally 里，没独立归属
- `roundsWithoutTodo` 的更新分散在“无工具响应”和“工具轮结束”两个分支

### 这轮实际做的事

1. 新增 `runtime/query-finalization.ts`
2. 抽出：
   - `finalizeAssistantOnlyRound(...)`
   - `finalizeToolDrivenRound(...)`
   - `runQueryStopStage(...)`
3. 让 finalization 统一负责：
   - assistant-only round 计数
   - auto delivery summary 回写
   - Stop hook 注入
4. 补 `query-finalization` 单测

## 本轮采纳了什么

### 采纳

- 把 finalization 视为正式 query stage
- 把 auto delivery 和 stop hook 归到同一个收尾边界
- 让 `agent-loop.ts` 尽量只保留 orchestrator 角色

### 暂不采纳

- 还没有把 while-loop lifecycle 本身提成更显式的 query engine 对象
- 还没有把 loop start / trace setup 再拆成单独 stage
- 还没有回头做第二轮外部源码逐文件差距校正

原因是这一轮的目标，是先把主循环里最后两段明显有职责的尾部逻辑收完。

## 到这里就先停

这轮完成后，当前 query core 的主要阶段已经基本齐了。下一步更自然的，不再是继续机械抽段，而是：

- 回头对照外部源码做第二轮边界校正
- 判断 registry metadata、query engine 形态、services 边界还需要怎么调整
