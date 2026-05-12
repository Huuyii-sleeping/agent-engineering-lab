# 第十一轮学习沉淀：query 工具循环第一轮

## 这轮真正学到的东西

### 1. tool loop 不是“模型之后顺手做点事”，而是 query stage 里的另一条稳定主链

把 recovery 主链抽走之后，`agent-loop.ts` 剩下最厚的就是 tool loop：

- tool preview
- PreToolUse hook
- tool execute
- tool result observability
- PostToolUse hook
- write side effect 跟踪
- todo / task_create / task_update 状态联动

这些逻辑其实已经不是“零散工具细节”，而是 query round 的完整执行阶段。

### 2. 当前仓库的工具执行边界，已经开始分成两层

这一轮拆完之后，可以更明确地区分两层职责：

- `tool-runtime.ts`
  - 负责单个工具执行边界：解析目标、replay、安全门、handler 包装
- `query-tools.ts`
  - 负责 query round 里的工具阶段：hook、观测、消息回写、任务状态联动

这两层不是重复，而是一个管“单工具执行”，一个管“工具阶段编排”。

### 3. tool stage 抽出来后，主循环已经只剩真正的 query 骨架

到这一步，`agent-loop.ts` 的结构已经相当清楚：

- round start
- round preparation
- model stage
- tool stage
- auto delivery
- stop hook

这说明拆分方向是对的，剩下没有抽掉的部分已经明显减少。

## 这轮怎么映射到本仓库

### 原来的问题

- `agent-loop.ts` 里直接串着 tool hook、执行、观测、消息回写和 task 状态同步
- `todo -> task_update(auto)` 这类约定逻辑没有独立归属
- query stage 的边界还差最后一块

### 这轮实际做的事

1. 新增 `runtime/query-tools.ts`
2. 抽出 `runQueryToolStage(...)`
3. 让这个阶段统一负责：
   - tool preview 与 `tool_call` 事件
   - `PreToolUse` / `PostToolUse`
   - tool output 分析与 `tool_result` / `security_blocked`
   - tool message 回写
   - write side effect 跟踪
   - `task_create` / `task_update` / `todo` 状态联动
4. 补 `query-tools` 单测

## 本轮采纳了什么

### 采纳

- 把 tool loop 视为正式 query stage
- 把 task 状态联动和 tool hook orchestration 放进同一阶段收口
- 继续让主循环只负责阶段衔接，不负责阶段内部细节

### 暂不采纳

- 还没有把 auto delivery follow-up 抽成独立阶段
- 还没有把 stop hook 收尾进一步模块化
- 还没有把 query runtime 升成更显式的 engine / pipeline 对象

原因是这一轮目标就是先把最明显的一整段 tool loop 收出去，保持小步推进。

## 到这里就先停

这轮完成后，当前 query core 的主要厚段已经基本被切成阶段。下一步最自然的是继续处理：

- auto delivery follow-up
- stop / round finalization
- 或者开始回头对照外部源码做第二轮边界校正
