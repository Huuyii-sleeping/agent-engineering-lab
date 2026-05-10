## Context

当前主循环在完成 prompt 组装后，直接调用一次 `client.chat.completions.create(...)`。这意味着：
- 请求前虽然有自动压缩，但没有“预算化恢复状态”
- 请求后没有针对 `finish_reason === "length"` 的续写机制
- 请求异常没有按错误类型分流到压缩或 backoff 路径

PRD-16 的目标不是引入复杂工作流编排，而是在现有主循环内补一个收敛明确、可测试、预算有限的恢复层。

## Goals / Non-Goals

**Goals:**

- 引入纯函数恢复 selector，显式输出 `continue | compact | backoff | fail`
- 将恢复状态最小化为三组 attempt 计数
- 在主循环中统一处理三条恢复路径
- 对恢复决策写入 observability 事件
- 让恢复策略可以单独单测，主循环可以 smoke 验证

**Non-Goals:**

- 不实现任意错误的自动自愈
- 不引入跨会话恢复或持久化重试队列
- 不修改工具调用协议本身

## Decisions

### 决策 1：新增独立 `recovery.ts` 模块，而不是把判定逻辑散落在 `agent-loop.ts`

`recovery.ts` 负责：
- 恢复状态类型
- 错误分类
- 恢复决策
- 续写提示与 backoff 计算

这样主循环只负责消费决策并执行动作，避免继续把错误分支堆进 `agent-loop.ts`。

### 决策 2：恢复决策以“原因 -> 动作”的纯函数形式实现

selector 输入统一的 `RecoverySignal`，输出：
- `continue`
- `compact`
- `backoff`
- `fail`

选择原因：
- 易测
- 能明确预算是否耗尽
- 便于将 observability 聚焦到“做了什么决策”

### 决策 3：续写采用“临时 assistant 片段 + continue 提示”的请求拼装方式

当模型因为 `max_tokens` 截断且未产生 tool calls 时：
- 不立即把片段写入最终历史
- 仅在恢复请求中临时加入部分 assistant 输出
- 追加“从中断处继续，不要重复”的提示
- 成功后再把所有片段合并成一个最终 assistant 消息写回历史

这样可以保证 CLI 最终输出完整答案，而不是只显示最后一段。

### 决策 4：上下文过长优先走 `compact`

上下文过长可能发生在两处：
- 请求前 token 估算超阈值
- 请求时 API 返回 context-too-long 类错误

两者都交给同一个恢复 selector，并受 `compactAttempts` 预算约束。

### 决策 5：瞬时故障使用指数退避，但预算有限

对 `timeout / rate limit / unavailable / connection / 5xx` 一类错误：
- 按 `base * 2^n` 退避
- 受最大 delay cap 限制
- 受 `transportAttempts` 限制

达到预算后明确失败，不允许无限重试。

## Risks / Trade-offs

- [Risk] 续写提示可能在少数模型行为下仍产生轻微重复
  Mitigation：显式提示“continue from the last sentence, do not repeat prior text”，并通过 smoke 验证最终输出合并

- [Risk] 自动压缩可能把恢复上下文压得过短
  Mitigation：保留现有 compact 行为，只增加预算与重试控制，不扩大压缩算法范围

- [Risk] 新增恢复层会让主循环更复杂
  Mitigation：将分类与策略抽离到独立模块，主循环只执行动作

## Migration Plan

1. 新增 `recovery.ts` 与对应单测
2. 扩展 runtime config，暴露恢复预算与 backoff 参数
3. 将 `agent-loop.ts` 改造为恢复请求循环
4. 新增 PRD-16 smoke 验证三条恢复路径
5. 构建、测试、清理运行产物
