## Context

`buildStablePromptSections` 会把 `agentMemory.currentIndex` 放入 `Agent Memory` stable section。该 section 是 cacheable system prompt 的一部分，若 index 过长，会直接增加 primary system prompt 体积。当前 memory subsystem 已经有检索 topK、上下文 token 上限和 compact 机制，但 stable prompt 的 agent memory entrypoint 尚未做类似边界。

## Goals / Non-Goals

**Goals:**

- 对 agent memory `currentIndex` 施加稳定、可测试的行数与字符上限。
- 截断说明进入 prompt，让模型知道当前只看到 entrypoint 摘要片段。
- 保持现有 `agentMemory` 输入类型和 prompt section 顺序不变。

**Non-Goals:**

- 不改变 memory 文件读取或写入逻辑。
- 不新增 runtime config。
- 不做 query streaming 或多 agent backend 重构。

## Decisions

### 1. 在 prompt section 层截断，而不是 memory store 层截断

决策：在 `prompt/sections.ts` 中处理 `currentIndex`，因为风险发生在 prompt 注入边界。

备选方案：在 memory store 写入 `MEMORY.md` 时限制大小。

不采用原因：写入层限制会破坏用户可维护的 durable memory 文件；prompt 层截断能保留文件内容，同时保护 system prompt。

### 2. 同时限制行数与字符数

决策：保留前 `120` 行且最多 `12000` 字符，任一超限都截断，并追加说明。

备选方案：只限制字符数。

不采用原因：只限制字符数无法防止大量短行造成 prompt 结构噪音；行数和字符数双边界更接近 memory entrypoint 的实际风险。

### 3. 固定常量，不新增配置

决策：本轮使用模块内常量，避免把小边界扩成配置治理。

备选方案：新增 runtime config。

不采用原因：当前目标是加固默认安全边界；配置面会增加测试和 UI 披露成本，收益有限。

## Risks / Trade-offs

- [Risk] 过短截断可能隐藏有用 memory。Mitigation：保留前 120 行/12000 字符，且提示用户 current index 被截断，可继续通过 memory 工具读取文件。
- [Risk] 固定常量未来不适配所有模型。Mitigation：先满足默认边界，后续如确有需要再产品化配置。
