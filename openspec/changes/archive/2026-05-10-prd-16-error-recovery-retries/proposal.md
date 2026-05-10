## Why

当前 `apps/agent-cli` 在模型请求失败时仍然偏“直线型”：
- 上下文过长只在请求前做一次自动压缩，没有显式恢复预算与决策结构
- `max_tokens` 截断会直接结束本轮，无法续写
- rate limit / timeout / unavailable / connection 这类瞬时失败会直接抛出，CLI 体验中断

PRD-16 需要把这些“可恢复失败”收敛为统一的恢复机制，让 Agent 在有限预算内自动续行，并在不可恢复时明确失败原因，而不是无声重试或直接崩掉。

## What Changes

- 新增恢复分类与决策模块，输出结构化动作：`continue | compact | backoff | fail`
- 为三类恢复路径引入独立预算：
  - `continuation_attempts`
  - `compact_attempts`
  - `transport_attempts`
- 改造 `agent-loop.ts` 的模型请求流程，支持：
  - 输出截断后的续写
  - 上下文过长时压缩后重试
  - 瞬时传输/API 故障时退避重试
- 通过统一的 runtime config 暴露恢复预算与 backoff 参数
- 补充 selector 单测与主循环 smoke 验证

## Capabilities

### New Capabilities

- `error-recovery-retries`: 定义恢复分类、预算、退避与续写行为

### Modified Capabilities

- `core-agent-loop`: 主循环的模型请求从单次调用升级为带恢复预算的请求循环

## Impact

- 影响代码：
  - `apps/agent-cli/src/agent-loop.ts`
  - `apps/agent-cli/src/runtime-config.ts`
  - 新增 `apps/agent-cli/src/recovery.ts`
- 影响测试：
  - 新增恢复 selector 单测
  - 新增 PRD-16 smoke
- 不改变 CLI 外部命令接口，但会改变失败时的运行时行为与日志
