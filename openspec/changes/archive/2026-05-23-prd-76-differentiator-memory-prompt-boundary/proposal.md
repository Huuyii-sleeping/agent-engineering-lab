## Why

参考 Claude Code differentiators 对比，文件化 memory 的关键不只是“能读取 MEMORY.md”，还要有稳定的 prompt 入口边界。当前仓库已有 agent memory prompt 绑定，但 `currentIndex` 会原样进入 stable system prompt，超长 index 会撑大 prompt、影响 cache 稳定性和长会话治理。

## What Changes

In Scope:

- 为 `Agent Memory` stable prompt section 中的 `currentIndex` 增加行数与字符硬上限。
- 截断时在 prompt 中追加可读说明，明确原始行数/字符数与保留上限。
- 保持 `StaticPromptSource.agentMemory.currentIndex` 输入兼容，不改 memory 文件结构。
- 增加 prompt builder 单元测试和 PRD-76 smoke。

Out of Scope:

- 不重写 query runtime 为 streaming kernel。
- 不新增外部 swarm backend、tmux 或 iTerm 集成。
- 不改变 memory 检索、持久化、team memory sync 或 agent memory snapshot 语义。
- 不引入新依赖。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `system-prompt-pipeline`: Agent Memory prompt section 需要对 `currentIndex` 做硬边界截断并披露截断状态。

## Impact

- 影响 `apps/agent-cli/src/prompt/sections.ts`。
- 影响 `apps/agent-cli/test/unit/prompt/builder.test.ts`。
- 新增 `apps/agent-cli/test/smoke/prd76-memory-prompt-boundary-smoke.ts`。
- 影响 OpenSpec 主规范 `system-prompt-pipeline`。
