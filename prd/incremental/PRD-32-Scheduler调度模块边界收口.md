# PRD-32 Scheduler 调度模块边界收口

## 背景

`apps/agent-cli/src/tools/scheduler.ts` 当前同时承载 schedule tool schema、cron 解析、持久化读写、tick 编排、通知队列和 public handlers。它已经成为 tools 层剩余最明显的状态聚合文件之一。

## 目标

- 拆出 scheduler types / 时间归一化 helper。
- 拆出 cron 解析与匹配边界。
- 拆出 scheduler store，承接 `.schedule/records.json` 与 `notifications.json` 的持久化和兼容读取。
- 拆出 scheduler manager，承接 create / list / remove / tick / drain / peek 编排。
- 收窄 `tools/scheduler.ts` 为 tool schema、默认 manager 和兼容导出 facade。
- 补 focused tests 与中文学习沉淀文档。

## 非目标

- 不改变 `schedule_*` tool schema、handler 导出或 JSON 输出 shape。
- 不改变 5-field / 6-field cron 语义、duplicate firing guard 或 durable schedule 语义。
- 不把 scheduler 迁移到 `services/`。
- 不顺手重构 `background-task.ts`。

## 验收标准

1. `tools/scheduler.ts` 不再直接承载 cron 解析、持久化和 tick 细节。
2. focused tests 覆盖：
   - cron 解析与匹配
   - legacy timestamp 兼容读取
   - tick 去重与 one-shot disable
3. 原有 `PRD-17` scheduler smoke 保持通过。
4. `pnpm --filter agent-cli build` 通过。
5. `openspec validate --all --strict` 通过。
6. 新增学习沉淀文档记录本轮采纳与暂不采纳内容。
