## Why

当前 `apps/agent-cli` 的模型使用方式仍然非常单一：
- 主循环与 subagent 都直接使用同一个 `MODEL`
- 没有按照任务类型区分模型策略
- 没有会话预算或日预算守卫
- 主模型失败时只有请求级恢复，没有“换备选模型继续”的策略
- 可观测数据只记录 token 数量，没有统一的成本估算与模型选择结果

PRD-11 需要把“模型怎么选、预算怎么控、失败后怎么降级”收敛成统一能力，避免后续功能都各自硬编码模型决策。

## What Changes

- 新增统一模型策略模块，按 `planning / coding / review / ops` 路由模型
- 新增预算管理，支持 session / daily 两级 token budget 守卫
- 新增主模型失败后的 fallback 选择
- 主循环与 subagent 改为共用同一模型选择入口
- 将模型选择、成本估算、延迟与预算命中写入 observability

## Capabilities

### New Capabilities

- `model-policy-budget-fallback`: 定义模型路由、预算守卫、降级与成本估算能力

### Modified Capabilities

- `core-agent-loop`: 主循环模型请求不再直接使用单一静态模型，而是走统一策略决策
- `subagent-collaboration`: 子代理请求复用统一模型策略与预算守卫

## Impact

- 影响代码：
  - 新增 `apps/agent-cli/src/model-policy.ts`
  - `apps/agent-cli/src/config.ts`
  - `apps/agent-cli/src/agent-loop.ts`
  - `apps/agent-cli/src/tools/subagent.ts`
  - `apps/agent-cli/src/runtime-config.ts`
  - `apps/agent-cli/src/observability/runtime.ts`
- 影响测试：
  - 新增模型策略单测
  - 新增 PRD-11 smoke
- 不改 CLI 交互协议，但会改变模型选型、预算超限行为与 observability 内容
