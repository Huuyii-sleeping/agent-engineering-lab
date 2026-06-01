## Why

当前 session resume 已有存储层 smoke 覆盖，但还缺少通过 AgentService / QueryEngine 继续对话的本地生产级验证。生产环境中最关键的风险不是单个 JSON 文件能否读取，而是进程重启后是否能恢复同一个 session、保留上下文和 runtime state，并继续走真实 agent loop。

## What Changes

- 新增本地 session/resume harness 场景，覆盖创建 session、执行首轮 chat、重建服务实例、恢复 session、继续后续 chat 的完整链路。
- 将该场景注册进现有 harness matrix，使 `test:harness` 与 release gate 能覆盖恢复链路。
- 增加断言：session id 不变、history 保留并追加、runtime state 连续、journal 追加多条记录、两个 session 恢复时不串线。
- In Scope：本地 deterministic model、本地临时 workspace、本地 SessionStore / AgentService / QueryEngine 链路。
- Out of Scope：远端执行、分布式 session 存储、跨机器恢复、UI/TUI 展示、真实模型网络调用。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-service-sessions`: 增加服务层重启恢复必须具备本地 harness 覆盖的要求。
- `agent-cli-test-harness`: 增加 session/resume 生产级黄金场景必须纳入 harness matrix 的要求。

## Impact

- 影响测试与 harness：`apps/agent-cli/test/unit/**`、`apps/agent-cli/test/harness/**` 或现有 matrix 注册位置。
- 影响 service/session 相关实现：如现有服务层无法恢复持久化 session，需要补齐恢复入口或注入方式。
- 影响验证入口：`pnpm --dir apps/agent-cli run test:harness` 与 `pnpm --dir apps/agent-cli run release:check`。
