## Context

PRD-92 和 PRD-93 已经完成任务级 lease、`schedule_explain` 与 `next_run_at` due 判断。当前剩余问题不再是“能否提醒”，而是生产运维问题：错过周期如何处理、如何暂停/恢复/修改任务、如何观察 scheduler 状态、如何降低 JSON 文件写坏风险。

## Goals / Non-Goals

**Goals:**

- 在本地 JSON store 架构下实现生产级 cron 策略与管理能力。
- 保持默认 `fire_once` 行为与现有用户体验兼容。
- 让 skipped、catch-up、pause/resume/update 都可通过 history/explain/stats 诊断。
- 将 JSON 写入改为原子替换，避免半写入文件。

**Non-Goals:**

- 不引入外部持久化组件。
- 不实现跨机器调度。
- 不实现远端任务 ack 或 exactly-once delivery。
- 不做 timezone/DST 策略。

## Decisions

### 决策 1：misfire 策略放在 schedule record 上

- 方案：新增 `misfire_policy` 与 `max_catch_up` 字段。
- 理由：策略属于任务自身，list/explain/update 都应能看到和修改。
- 备选：全局配置。未采用原因是不同提醒任务可能需要不同策略。

### 决策 2：默认 `fire_once`

- 方案：legacy 和新任务默认 `fire_once`，错过多个周期只补发一次。
- 理由：最接近当前行为，不会突然向用户注入大量过期 prompt。
- 备选：默认 `catch_up`。未采用原因是风险更高，容易 notification 风暴。

### 决策 3：`catch_up` 使用上限保护

- 方案：`max_catch_up` 默认为 5，最小 1，最大 20。
- 理由：保留补发能力，同时防止长时间离线后大量 notification。
- 备选：无限补发。未采用原因是不适合交互式 agent。

### 决策 4：本地 JSON 使用原子写入

- 方案：写入同目录 `.tmp` 文件，再 rename 到目标文件。
- 理由：不增加依赖即可降低半写入损坏风险。
- 备选：引入 SQLite。未采用原因是本仓库当前 scheduler 仍定位本地轻量运行时，本轮避免新增依赖。

## Risks / Trade-offs

- [Risk] JSON store 仍不是跨机器事务系统 → Mitigation：明确只承诺本地生产级。
- [Risk] catch-up 可能产生多条 prompt → Mitigation：默认不启用，并用 `max_catch_up` 限制。
- [Risk] pause/update 与已有模型工具调用可能产生更多误操作 → Mitigation：工具参数保持显式，`schedule_update` 只允许有限字段。
