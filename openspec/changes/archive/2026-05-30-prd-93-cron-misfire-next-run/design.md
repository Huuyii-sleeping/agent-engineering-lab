## Context

现有 scheduler 已保存 `next_run_at`，但 tick 的 cron 命中仍依赖 `cronMatches(record.cron, now)`。这导致 cron 表达式在精确秒命中，但 tick 稍晚运行时不会触发。对于终端 TUI 和本地 daemon 轮询，这种精确秒依赖过于脆弱。

## Goals / Non-Goals

**Goals:**

- 以 `next_run_at` 作为 cron due 的主要判断依据。
- tick 晚到时补发一次，而不是静默错过。
- 触发后推进 `next_run_at` 到当前 tick 之后。
- 保持 one-shot、lease、duplicate guard、history 和 notification 行为不变。
- explain 与 tick 使用一致的 due 语义。

**Non-Goals:**

- 不回放所有错过周期。
- 不新增 misfire grace 配置。
- 不新增 retry/backoff。
- 不引入数据库或队列。

## Decisions

### 决策 1：cron due 判断优先使用 `next_run_at <= now`

- 方案：对 cron schedule，如果 `next_run_at` 为空则先计算；如果 `next_run_at <= scannedAt` 则 due。
- 理由：`next_run_at` 已是持久化生命周期字段，使用它可以避免精确秒 tick 依赖，并让 explain 更容易说明。
- 备选：继续使用 `cronMatches(now)` 并扩大匹配窗口。未采用原因是窗口会引入重复触发和边界模糊，仍不如 `next_run_at` 明确。

### 决策 2：每次 late tick 只补发一次

- 方案：即使 schedule 已错过多个周期，本轮 tick 也只生成一条 notification，然后从当前 tick 时间计算下一次运行。
- 理由：Agent 提醒是 prompt 注入，不适合一次性灌入大量历史提醒；本轮先保证“不丢当前提醒”，而不是完整 catch-up。
- 备选：循环补发所有 missed runs。未采用原因是可能导致 notification 风暴，需要单独的限流和用户体验设计。

### 决策 3：explain 复用 tick due 判断

- 方案：抽出 due 判断辅助逻辑，让 tick 和 explain 使用一致语义。
- 理由：避免用户看到 explain 说未 due，但 tick 实际会触发，或反过来。
- 备选：explain 独立判断。未采用原因是会造成诊断偏差。

## Risks / Trade-offs

- [Risk] 长时间离线后只补发一次，可能不是严格 cron 回放语义 → Mitigation：PRD 明确不做多周期 catch-up，后续可用单独 PRD 增加策略配置。
- [Risk] 旧记录 `next_run_at = null` 时需要现场计算 → Mitigation：tick/explain 遇到空值时按当前时间计算下一次，保持兼容。
- [Risk] 迟到触发改变了过去“精确秒才触发”的行为 → Mitigation：这是本轮目标行为，且更符合提醒场景。
