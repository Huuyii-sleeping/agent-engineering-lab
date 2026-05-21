## Why

外部 prompt 管理分析指出，成熟 agent 运行时不会只把 prompt 当作一段静态文本，而是将其拆成稳定规则、动态上下文、专项任务 prompt、缓存边界和可审计导出。当前项目已有基础 `prompt` 模块，但 section 缺少元数据、缓存语义和确定性注入优先级，导致后续 memory、compact、runtime reminder 和审计能力会继续以散落字符串扩展。

## What Changes

In Scope:

- 为 prompt section 增加类型、来源、优先级、缓存策略、估算 token 和 inclusion reason。
- 扩展 prompt builder，使 stable prompt、override prompt、append prompt、user context、memory context 与 dynamic reminder 按确定顺序合成。
- 增加专项 prompt 构造入口，至少覆盖 memory context、compact summary 和 runtime reminder。
- 扩展 prompt inspection 输出 section metadata，默认模式不泄露敏感正文，protected 模式保留完整导出能力。
- 增加 PRD-73 smoke 测试与对应单元测试。

Out of Scope:

- 不实现 provider 级 prompt cache。
- 不改变 OpenAI SDK 调用形态。
- 不重写核心 system prompt 文案。
- 不把 prompt 模板迁移到外部文件系统。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `system-prompt-pipeline`: 增加 prompt section 元数据、缓存/优先级语义、专项 prompt 构造和 inspection 治理信息要求。

## Impact

- 影响 `apps/agent-cli/src/prompt/**` 的类型、builder、sections 与 inspection 输出。
- 影响模型请求前的 prompt envelope 组装，不改变实际模型 API。
- 影响 `/prompt`、`dump-system-prompt` 和相关 CLI 渲染测试。
- 新增或更新 `apps/agent-cli/test/unit/prompt/**`、`apps/agent-cli/test/unit/runtime/**` 和 `apps/agent-cli/test/smoke/prd73-*.ts`。

