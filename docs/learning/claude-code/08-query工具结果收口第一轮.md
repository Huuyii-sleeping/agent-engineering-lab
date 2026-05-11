# 第八轮学习沉淀：query 工具结果收口第一轮

## 这轮真正学到的东西

### 1. `agent-loop.ts` 里很多“看起来小”的工具收尾逻辑，其实也是 query runtime 边界的一部分

这一轮继续看 `agent-loop.ts` 会发现，除了通知收集之外，还有一批零散但稳定存在的职责：

- tool output 结果分析
- task_create 返回值解析
- write side effect 跟踪
- todo 完成态判断

这些逻辑虽然不大，但都在描述“工具执行完之后，query runtime 应该怎么更新自己的状态”。

### 2. 先把 tool result helper 收口，比直接重写整段 tool loop 更稳

这轮没有直接把整段 tool loop 提成完整 stage，而是先把其中比较稳定、纯度较高的辅助逻辑抽出来：

- `analyzeToolOutput(...)`
- `parseTaskIdFromToolOutput(...)`
- `markWriteSideEffect(...)`
- `isTodoCompletionRequest(...)`

这样做的价值是：

- 先降低 `agent-loop.ts` 的局部密度
- 让 query runtime 和 tool result state update 的边界更明确
- 为后面继续拆 tool result stage 打基础

### 3. query runtime 的下一步不是“重写”，而是继续把稳定小块搬出去

这几轮越来越清楚的一点是：当前仓库并不适合一口气上完整 `QueryEngine` 类。更稳的路径是：

- 先把通知逻辑搬出去
- 再把 tool result helper 搬出去
- 后面再看 memory 注入、recovery、model request 主链

也就是说，先持续降低主循环密度，再决定最终对象结构。

## 这轮怎么映射到本仓库

### 原来的问题

- `agent-loop.ts` 里同时包含工具执行、结果分析和 runtime state 更新
- 一些纯辅助逻辑和主循环混在一起
- 这会让后续继续拆 tool result stage 的改动面过大

### 这轮实际做的事

1. 新增 `runtime/query-tool-results.ts`
2. 把 tool output 分析逻辑抽成共享 helper
3. 把 task id 解析和 write side effect 跟踪抽出去
4. 把 todo 完成判断抽出去
5. 补对应单测

## 本轮采纳了什么

### 采纳

- 继续按小块渐进式收口
- 把“工具执行后的状态更新”视为 query runtime 的正式辅助边界
- 让 `agent-loop.ts` 继续往骨架化推进

### 暂不采纳

- 还没有把整段 tool loop 提成完整 stage
- 还没有拆 auto delivery follow-up
- 还没有碰 recovery / model request 主链

原因是这轮仍然坚持“先收稳定小块，再动复杂主链”。

## 到这里先停一下，下一步最自然的方向

1. 继续分析 `agent-loop.ts` 里的 memory 注入与 auto delivery 跟进逻辑
2. 再决定是否把 tool loop 提成更明确的 query stage
3. 等你回顾完这轮修改后，再决定下一刀切哪一块
