# Tasks

## 1. Tests

- [x] 1.1 补 `delay_ms` one-shot 创建与单次触发测试
- [x] 1.2 补 legacy record 迁移到生命周期字段测试
- [x] 1.3 补 tick lock 阻止并发重复触发测试
- [x] 1.4 补 fired history 持久化与 list 可见性测试

## 2. Implementation

- [x] 2.1 扩展 scheduler types，加入 task lifecycle 与 history 类型
- [x] 2.2 扩展 store，支持 records migration、history persistence 和 lock file
- [x] 2.3 扩展 cron helper，提供有界 next-run 计算
- [x] 2.4 重构 manager，支持 once/delay、lock、history、next_run_at 与 run_count
- [x] 2.5 扩展 tool facade 和 base dispatch，支持 `once_at` / `delay_ms` 输入和 list 输出

## 3. Validation

- [x] 3.1 运行 scheduler 相关 unit tests
- [x] 3.2 运行 PRD-17/83/85 相关 smoke 或回归测试
- [x] 3.3 运行 `pnpm build`
- [x] 3.4 运行 OpenSpec status 和 validate
- [x] 3.5 archive 变更并本地 commit
