## Context

现有 scheduler 使用全局 tick lock 避免多个进程同时扫描同一批任务，并将命中的任务写入持久化 notifications。该设计已经能避免“整批扫描并发”，但单条 schedule 没有自己的租约状态：当任务处理过程被打断、未来引入 daemon 或更细粒度并发时，无法判断某条任务是否正在被处理，也无法给用户解释“为什么没有触发”。

本 PRD 不扩大到完整生产调度系统，只在当前本地 JSON store 模型上增加任务级 lease 与 explain 诊断。

## Goals / Non-Goals

**Goals:**

- 在 schedule record 中持久化 `lease_owner` / `lease_until`。
- tick 对 due schedule 执行任务级 lease claim，避免未来并发模型下重复触发同一条 schedule。
- stale lease 到期后可被当前 tick 恢复处理。
- `schedule_explain` 以结构化 JSON 给出状态、lease、due、history 与 reason。
- 保持 legacy records 可读，保持现有 `schedule_create/list/remove` 行为兼容。

**Non-Goals:**

- 不做 retry/backoff 与错误重试队列。
- 不做 misfire 补偿窗口。
- 不做后台 daemon push。
- 不引入数据库或跨机器分布式锁。

## Decisions

### 决策 1：在现有 JSON record 上增加 lease 字段

- 方案：`ScheduleRecord` 直接增加 `lease_owner: string | null`、`lease_until: number | null`。
- 理由：当前 scheduler store 已以 records.json 作为唯一真源，新增字段最小化迁移成本，也方便 `schedule_list` 和 `schedule_explain` 直接展示。
- 备选：单独维护 leases.json。未采用原因是会增加双文件一致性问题，当前没有跨机器并发需求。

### 决策 2：tick 内同步 claim 并在成功触发后清理

- 方案：due schedule 进入触发逻辑前检查 lease；其他 owner 的未过期 lease 直接跳过，过期 lease 可覆盖；当前 owner claim 后写入 notification/history/record，最终清理 lease。
- 理由：当前 tick 已持有全局 lock，任务级 lease 主要用于状态可见、未来演进和中断恢复。保持在同一 saveRecords 流程中，避免扩大文件写入复杂度。
- 备选：每条任务 claim 后立即 saveRecords。未采用原因是当前全局 lock 已提供扫描互斥，立即落盘会显著增加 I/O；本轮先保证行为与诊断能力。

### 决策 3：新增 `schedule_explain` 而不是扩展 `schedule_list`

- 方案：`schedule_list` 保持列表语义，`schedule_explain(id)` 专注单条任务诊断。
- 理由：list 面向概览，explain 面向“为什么没触发”的精确回答，返回可读 reason 和 recent history 更合适。
- 备选：把 reason 全量加入 `schedule_list`。未采用原因是列表会变重，也会让模型在普通枚举时看到过多诊断字段。

## Risks / Trade-offs

- [Risk] 当前 JSON store 不是跨机器事务存储 → Mitigation：本 PRD 只承诺本地进程级生产化基础，不声明分布式语义。
- [Risk] tick 内 claim 不立即落盘，进程崩溃时 lease 可能不可见 → Mitigation：当前全局 lock 仍是扫描互斥；本 PRD 的 lease 主要服务可观测与后续演进，后续 PRD 可引入 per-task atomic claim。
- [Risk] explain reason 可能与未来 retry/misfire 策略不一致 → Mitigation：reason 只描述当前字段可判断的事实，后续策略新增字段时再扩展。

## Migration Plan

- `SchedulerStore.loadRecords()` 对缺失 lease 字段的历史记录补齐 `null`。
- `createSchedule()` 新建记录写入 `lease_owner: null`、`lease_until: null`。
- 无需一次性迁移脚本；下一次保存 records 时会自然写回新字段。
