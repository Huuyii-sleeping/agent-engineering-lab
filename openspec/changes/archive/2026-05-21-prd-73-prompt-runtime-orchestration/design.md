## Context

当前 `PromptSection` 只有 `id/title/content`，`buildPromptEnvelope` 将 stable sections 拼成一个主 system prompt，再把 memory 与 dynamic messages 作为 supplemental system messages。这个结构满足基础分层，但无法表达 section 为什么进入模型、是否稳定、是否适合缓存、来自哪个运行时来源，也无法让 inspection surface 在不泄露正文的情况下解释 prompt 治理状态。

本 PRD 参考 `https://github.com/liuup/claude-code-analysis/blob/main/analysis/04g-prompt-management.md`，只吸收可落地到当前项目的小步能力：section 元数据、确定性合成顺序、专项 prompt 构造和 inspection 可见性。

## Goals / Non-Goals

**Goals:**

- 让 prompt section 成为可审计的数据结构，而不是只有正文的字符串。
- 明确 stable / dynamic / user context / runtime reminder 的合成优先级。
- 用本地 `cachePolicy` 标记 stable section 和动态 section 的缓存语义，为后续 provider cache 接入留边界。
- 保持模型请求行为兼容：最终仍是主 system prompt 加 supplemental system messages。

**Non-Goals:**

- 不接入真实 provider prompt cache。
- 不做 prompt 内容大型重写。
- 不引入外部模板语言。

## Decisions

### 1. 扩展现有 `PromptSection`，不新增并行模型

决策：在 `src/prompt/types.ts` 扩展 `PromptSection` 字段，新增 `kind/source/cachePolicy/priority/inclusionReason/estimatedTokens`。

备选方案：新增 `PromptPart` 与 `PromptSection` 并行。  
不采用原因：当前代码和测试已经围绕 `PromptSection` 展开，并行模型会造成迁移噪音。

### 2. 保持输出兼容，metadata 只随 envelope 和 inspection 暴露

决策：`PromptEnvelope.primarySystemPrompt` 和 `supplementalSystemMessages` 保持字符串数组，新增 `sectionMetadata` 或直接复用 sections 暴露 metadata。

备选方案：让模型请求直接消费 section 数组。  
不采用原因：OpenAI Chat Completions 当前仍需要 message 数组，过早改变请求层收益低。

### 3. 新增专项 prompt helper，避免业务层继续拼字符串

决策：在 `prompt/sections.ts` 中提供 memory、compact summary、runtime reminder、user context 等 section builder。业务层仍可传字符串，但 builder 会统一包装成带来源和原因的 section。

备选方案：为每类 prompt 建独立文件。  
不采用原因：当前范围较小，集中在 `prompt` 模块内更易验证；后续复杂度上升再拆分。

### 4. token 估算复用现有近似算法思想

决策：prompt section 的 `estimatedTokens` 使用本地轻量估算函数，不引入 tokenizer 依赖。

备选方案：引入精确 tokenizer。  
不采用原因：会增加依赖和维护成本，当前只需要治理可见性和粗略预算。

## Risks / Trade-offs

- [Risk] section metadata 字段增加后测试快照或断言需要更新。  
  Mitigation: 保持旧字段不变，新增测试只验证新 metadata。
- [Risk] 过度抽象 prompt helper。  
  Mitigation: 只覆盖当前已有动态来源，不引入模板系统。
- [Risk] 默认 inspection 泄露更多信息。  
  Mitigation: 默认模式只显示 metadata 和脱敏摘要，完整正文仍走 protected 模式。

