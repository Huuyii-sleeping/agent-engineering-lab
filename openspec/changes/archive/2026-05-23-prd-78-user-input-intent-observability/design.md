## Context

当前 query round 会在 `recordQueryLoopStart` 中写入 `loop_start` 本地 observability 事件，并记录 `round` 与 `latestUserInput` 摘要。`06b-negative-keyword-analysis.md` 中提到的负面反馈 / 继续执行类关键词，本仓库尚未形成结构化信号。

本仓库同时已有隐私治理约束：本地 observability 与 remote telemetry 必须区分，且 remote analytics / feedback egress 仍是 reserved gap。因此本轮只在本地事件中增加最小化分类结果，不新增远端数据面。

## Goals / Non-Goals

**Goals:**

- 在 query round 开始时生成用户输入意图标签。
- 识别 `negative_feedback` 与 `keep_going` 两类信号。
- 只记录分类结果、匹配类别和输入长度，不新增原始 prompt 副本。
- 复用现有 observability service，保持 minimal / disabled 姿态语义。

**Non-Goals:**

- 不实现远端 analytics、feedback survey、transcript share 或训练上传。
- 不改变 hook、model request、tool execution 或 safety policy。
- 不把关键词分类用于阻断、改写或优先级调度。
- 不引入外部依赖或复杂 NLP 分类器。

## Decisions

### Decision 1: 在 `query-engine-round` 内做轻量分类

选择：新增 `classifyUserInputIntent` helper，并由 `recordQueryLoopStart` 写入 `userInputIntent`。

理由：`query-engine-round` 已经拥有最新用户输入、round 编号和 observability service，是最小接入点。分类与 `loop_start` 绑定，便于 replay 时按 trace 查看输入态势。

备选方案：在 `applyUserPromptSubmit` 中分类。未采用原因是该阶段更靠近 hook 入口，容易让分类被误解为输入拦截或策略决策。

### Decision 2: 输出最小结构化标签而非原文

选择：`userInputIntent` 包含 `negativeFeedback`、`keepGoing`、`categories`、`inputLength`，不包含新增的原始 prompt 或匹配片段。

理由：当前 `loop_start` 已有输入摘要字段，本轮不扩大原文保存面；分类结果足以支持诊断和统计。

备选方案：记录命中的关键词。未采用原因是关键词可能直接暴露用户表达，且对本轮诊断价值有限。

### Decision 3: 使用固定小词表

选择：用内置正则覆盖中英文常见负面反馈和继续执行表达。

理由：PRD 目标是本地最小信号，不需要外部依赖；固定词表容易测试和审计。

备选方案：使用模型做意图分类。未采用原因是会引入成本、延迟、隐私和不稳定性，且超出本轮范围。

## Risks / Trade-offs

- [Risk] 关键词分类可能误判。→ Mitigation：标签只用于本地诊断，不驱动安全、调度或模型行为。
- [Risk] 词表覆盖不完整。→ Mitigation：先覆盖高频表达，后续按真实本地回放案例迭代。
- [Risk] observability disabled 模式下不应落盘。→ Mitigation：仍通过现有 `observabilityService.recordEvent` 写入，沿用已有姿态控制。

## Migration Plan

无需数据迁移。新字段只出现在后续新写入的 `loop_start` 事件中，历史 observability 事件保持不变。

## Open Questions

无。
