## 1. 测试先行

- [x] 1.1 增加 store 单测，覆盖 JSON 写入使用临时文件原子替换。
- [x] 1.2 增加 scheduler 单测，覆盖 legacy misfire 字段迁移。
- [x] 1.3 增加 scheduler 单测，覆盖 `misfire_policy = skip` 记录 skipped history 且不发 notification。
- [x] 1.4 增加 scheduler 单测，覆盖 `misfire_policy = catch_up` 按 `max_catch_up` 补发。
- [x] 1.5 增加 scheduler 单测，覆盖 pause/resume/update。
- [x] 1.6 增加 scheduler 单测，覆盖 `schedule_stats`。

## 2. 数据模型与 Store

- [x] 2.1 扩展 schedule 类型，增加 `misfire_policy`、`max_catch_up`。
- [x] 2.2 store 读取 legacy records 时迁移策略字段。
- [x] 2.3 store save 方法改为原子写入。

## 3. Misfire 策略

- [x] 3.1 实现 `fire_once` 默认策略。
- [x] 3.2 实现 `skip` 策略与 skipped history。
- [x] 3.3 实现 `catch_up` 策略与上限保护。
- [x] 3.4 更新 `schedule_explain` 返回策略字段和 reason。

## 4. 管理与指标工具

- [x] 4.1 实现 pause/resume/update manager 方法。
- [x] 4.2 暴露 `schedule_pause`、`schedule_resume`、`schedule_update` 工具。
- [x] 4.3 实现并暴露 `schedule_stats`。
- [x] 4.4 在 base handler 注册新增工具。

## 5. 验证与归档

- [x] 5.1 执行 scheduler/store 定向单测并修复失败。
- [x] 5.2 执行 `pnpm --dir apps/agent-cli test`、`pnpm --dir apps/agent-cli run test:scheduler` 与 `pnpm build`。
- [x] 5.3 执行 OpenSpec status/validate，通过后归档并本地提交。
