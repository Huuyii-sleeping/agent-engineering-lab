# Agent 主循环阶段化

## 这个操作解决什么问题

Agent 主循环天然会变复杂，因为一轮请求里会发生很多事：

- 准备系统提示词和动态上下文
- 注入记忆
- 执行 SessionStart hook
- 请求模型
- 处理模型失败和 fallback
- 执行工具调用
- 同步任务状态
- 自动交付验证
- 执行 Stop hook

如果全部写在一个函数里，后续任何小改动都会碰到主链路，风险很高。

## 为什么这么做

主循环的关键不是“代码少”，而是“阶段边界稳定”。每个阶段都应该回答一个问题：

- preparation：这一轮开始前要准备什么上下文？
- model：如何请求模型，失败如何恢复？
- tool stage：模型要求执行哪些工具，结果如何回填？
- finalization：一轮结束时如何更新状态、delivery、hook？
- engine：这些阶段按什么顺序串起来？

阶段化以后，主循环从“所有逻辑都在一起”变成“稳定编排多个阶段”。

## 怎么做

1. 把 QueryEngine 保留为编排者。
2. 把模型请求拆到 QueryModel。
3. 把工具执行拆到 QueryToolStage。
4. 把收尾拆到 QueryFinalization。
5. 把 round state、latest user summary、loop_start event 这类元数据拆到 round helper。
6. 用 focused tests 锁住阶段之间的契约，而不是只测最终输出。

## 优点

- 主循环更容易阅读，可以按阶段理解。
- 每个阶段有自己的测试，修改风险更可控。
- 新能力可以先判断属于哪个阶段，避免随手塞进 QueryEngine。
- 失败恢复、工具执行、交付验证这些复杂逻辑可以独立演进。

## 代价和风险

- 文件数量会增加。
- 过度阶段化会让控制流跳转太多。
- 如果阶段之间传递的对象不稳定，反而会形成新的耦合。

所以本项目保留了 QueryEngine 作为主编排点，没有把每一行都拆成 runner。

## 怎么用它讲这个项目

可以这样讲：

> 这个 Agent 的核心是一个分阶段主循环：准备上下文、请求模型、执行工具、收尾验证。我们把每个阶段拆成明确边界，但保留 QueryEngine 作为总编排，这样既能看清主链路，也能独立维护每个阶段。

这能解释为什么 runtime 目录里有 `query-model`、`query-tools`、`query-finalization`、`query-preparation`。
