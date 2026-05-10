## Why

当前 `apps/agent-cli` 能处理即时输入、后台任务通知、团队通知和子代理通知，但还不能记住“未来某个时间再做一件事”。一旦用户希望“10 分钟后提醒我继续”或“每天早上触发某个 prompt”，系统没有统一的持久化调度入口，也无法在下一轮主循环中把这类未来意图重新注入。

PRD-17 需要补一个轻量但可恢复的调度层，让 Agent 能持久化 future prompt，在分钟级命中后先进入通知队列，再由主循环统一注入，而不是偷偷后台执行。

## What Changes

- 新增 `ScheduleRecord` 持久化与分钟级扫描器
- 新增调度通知队列，命中后产出 `scheduled_prompt`
- 主循环接入 scheduler tick 与 `scheduled_prompt` 注入
- 新增最小工具接口用于创建、查看和删除调度
- 补 durable 恢复、去重与命中验证测试

## Capabilities

### New Capabilities

- `scheduled-prompt-runtime`: 管理未来 prompt 的持久化、轮询、命中与通知队列

### Modified Capabilities

- `core-agent-loop`: 主循环在每轮请求前接入 schedule tick，并统一注入命中的 `scheduled_prompt`

## Impact

- 影响代码：
  - `apps/agent-cli/src/agent-loop.ts`
  - `apps/agent-cli/src/runtime-config.ts`
  - 新增 `apps/agent-cli/src/tools/scheduler.ts`
  - `apps/agent-cli/src/tools/base.ts`
- 影响测试：
  - 新增 scheduler 单测
  - 新增 PRD-17 smoke
- 不引入毫秒级后台作业系统，保持分钟级、单进程、文件持久化语义
