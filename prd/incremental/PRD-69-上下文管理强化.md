# PRD-69 上下文管理强化

## 背景

参考 `04f-context-management.md` 后，当前仓库已有 `estimate_tokens`、`compact`、preflight auto compact、截断续写和 context-too-long 恢复，但仍偏基础：触发阈值只看固定估算值，压缩后没有判断是否真正降载，压缩摘要缺少结构化脱水与运行时状态补偿，模型 completion token 也不可配置。

## 目标

- 将上下文阈值从固定常量升级为有效窗口计算：`min(compactThresholdTokens, modelContextWindowTokens - reserveTokens)`。
- 自动压缩后验证收益，低收益压缩直接熔断并返回明确 recovery failure，避免反复压缩。
- 压缩摘要对旧消息执行脱水：保留角色、内容摘要、tool call/tool result/非文本内容计数，不把大块历史原样复灌。
- 自动压缩时补偿运行时状态：session、任务、触达文件、写文件状态等关键状态进入 compacted message。
- 模型 completion token 从固定 `8000` 改为运行时配置。

## In Scope

- `apps/agent-cli/src/runtime-config.ts`
- `apps/agent-cli/src/tools/context-compact.ts`
- `apps/agent-cli/src/runtime/query-model*.ts`
- 相关 unit/smoke 测试与 OpenSpec 变更文档。

## Out of Scope

- 不实现真正后台摘要模型。
- 不引入向量检索、长期记忆重构或外部存储。
- 不实现 Claude Code 原版完整上下文协议，只实现当前仓库可落地的等价护栏。

## 验收标准

- 自动压缩触发使用有效上下文窗口，而不是单一固定阈值。
- 压缩低收益时不会无限 retry，并给出 `recovery_failed`。
- compacted message 包含结构化摘要和状态补偿信息。
- `max_tokens` 使用配置项，测试可验证传入 OpenAI request。
- OpenSpec validate、定向测试和 build 通过。
