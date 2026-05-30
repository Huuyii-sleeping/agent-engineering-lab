## 1. 测试先行

- [x] 1.1 增加 scheduler manager 单测，覆盖 active foreign lease 跳过触发。
- [x] 1.2 增加 scheduler manager 单测，覆盖 stale lease 接管并触发后清理。
- [x] 1.3 增加 `schedule_explain` 单测，覆盖 active lease reason 与 schedule not found。
- [x] 1.4 增加 scheduler store 单测，覆盖 legacy records lease 字段迁移为 null。

## 2. 数据模型与 Store

- [x] 2.1 扩展 `ScheduleRecord` 类型，增加 `lease_owner` 与 `lease_until`。
- [x] 2.2 更新 `SchedulerStore.loadRecords()`，读取并迁移 lease 字段。
- [x] 2.3 更新 `createSchedule()`，新建 schedule 默认写入空 lease。

## 3. Tick Lease 行为

- [x] 3.1 在 due schedule 触发前检查 active foreign lease 并跳过。
- [x] 3.2 在 stale lease 场景下由当前 tick owner 接管。
- [x] 3.3 schedule 成功触发、禁用或完成更新后清理 lease。

## 4. Explain 工具

- [x] 4.1 实现 `SchedulerManager.explainSchedule()`，返回 due/lease/history/reason。
- [x] 4.2 在 scheduler facade 中导出 `schedule_explain` schema 与 runner。
- [x] 4.3 在 base tool handler 中注册 `schedule_explain`。

## 5. 验证与归档

- [x] 5.1 执行 scheduler 相关单测并修复失败。
- [x] 5.2 执行 `pnpm --dir apps/agent-cli test` 与 `pnpm build`。
- [x] 5.3 执行 OpenSpec status/validate，通过后归档并本地提交。
