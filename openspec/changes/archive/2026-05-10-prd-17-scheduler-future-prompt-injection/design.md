## Context

当前运行时里已经存在多类“通知源”：
- background task
- team
- subagent

这些通知都遵循同一模式：
- 内部状态持有者维护数据
- 主循环在每轮前 drain 通知
- 通过 system message 注入提醒

PRD-17 适合复用同样模式，但与已有通知相比，它还有两个额外约束：
- 调度记录必须 durable，进程重启后可恢复
- 命中后不能直接后台执行，而是要转为 `scheduled_prompt` 通知，再由主循环继续处理

## Goals / Non-Goals

**Goals:**

- 为未来 prompt 定义稳定的 `ScheduleRecord`
- 分钟级扫描并生成 `scheduled_prompt`
- durable 调度跨重启恢复
- 主循环下一轮能看到调度触发内容
- 避免同一调度在同一分钟内重复连发

**Non-Goals:**

- 不实现企业级 job orchestration
- 不提供秒级或毫秒级调度
- 不在命中时直接执行模型调用或工具调用

## Decisions

### 决策 1：新增独立 `scheduler.ts`，复用“持久化 + drainNotifications”模式

`scheduler.ts` 负责：
- 记录持久化
- cron 解析与匹配
- 触发去重
- 命中后写入通知队列

主循环只负责：
- 调用 tick
- drain 通知
- 注入 prompt

### 决策 2：调度记录与通知队列都持久化到磁盘

建议目录：
- `.schedule/records.json`
- `.schedule/notifications.json`

原因：
- `durable` 调度需要跨重启恢复
- 如果进程在命中后、主循环下一轮前退出，通知也不应丢失

### 决策 3：分钟级扫描由主循环显式触发，而不是新增长期后台线程

在每轮主循环前调用一次 scheduler tick：
- 读取当前时间
- 只在分钟变化时实际扫描
- 命中则生成通知

这样实现简单、可测试，而且满足 PRD 的分钟级要求。

### 决策 4：`scheduled_prompt` 作为 supplemental system message 注入

命中的调度不会伪造真实 `user` 历史消息，而是以统一动态提醒的方式进入 prompt pipeline，例如：

```text
<scheduled_prompt id="...">
...
</scheduled_prompt>
```

这能和现有 notification 机制保持一致，同时仍然把未来任务显式送回主循环。

### 决策 5：提供最小工具集

提供以下工具即可满足使用与测试：
- `schedule_create`
- `schedule_list`
- `schedule_remove`

不额外实现复杂编辑能力。

## Risks / Trade-offs

- [Risk] cron 支持过弱导致表达能力不足
  Mitigation：首版支持标准 5 段表达式中的 `*`、单值、逗号列表和步长，满足分钟级需求

- [Risk] 调度命中后重复连发
  Mitigation：记录 `last_fired_at`，并以分钟粒度去重

- [Risk] 调度通知积压
  Mitigation：drain 后持久化清空，保持队列短小

## Migration Plan

1. 新增 `scheduler.ts` 和 runtime config
2. 接入 `BASE_TOOLS` 与主循环 tick/drain
3. 新增单测与 smoke 验证 durable、命中、去重
4. 构建、测试、清理运行产物
