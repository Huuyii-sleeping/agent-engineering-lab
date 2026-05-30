## 1. 测试先行

- [x] 1.1 增加 scheduler manager 单测，覆盖 cron tick 晚到时仍按 `next_run_at` 触发。
- [x] 1.2 增加 scheduler manager 单测，覆盖 late fire 后 `next_run_at` 推进到当前 tick 之后。
- [x] 1.3 增加 `schedule_explain` 单测，覆盖 overdue `next_run_at` 的 due 与 reason。

## 2. Due 判断与 Next Run 推进

- [x] 2.1 抽出 cron/once 共用 due 判断，cron 优先使用 `next_run_at <= now`。
- [x] 2.2 tick 未到期时补齐缺失的 `next_run_at`。
- [x] 2.3 tick 触发 cron 后从当前 tick 时间推进下一次 `next_run_at`。

## 3. Explain 对齐

- [x] 3.1 `explainSchedule()` 使用与 tick 一致的 due 判断。
- [x] 3.2 explain reason 区分 overdue `next_run_at`、精确命中和未到期状态。

## 4. 验证与归档

- [x] 4.1 执行 scheduler 定向单测并修复失败。
- [x] 4.2 执行 `pnpm --dir apps/agent-cli test`、`pnpm --dir apps/agent-cli run test:scheduler` 与 `pnpm build`。
- [x] 4.3 执行 OpenSpec status/validate，通过后归档并本地提交。
