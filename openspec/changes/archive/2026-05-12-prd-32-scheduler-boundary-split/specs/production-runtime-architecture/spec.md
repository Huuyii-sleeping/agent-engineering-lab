## ADDED Requirements

### Requirement: Scheduler internals MUST separate cron store manager and tool facade boundaries
Scheduler 工具内部 MUST 区分 cron 语义、持久化 store、调度 manager 与 tool facade，使 cron 匹配、持久化兼容、tick 编排和对外契约可以独立演进。

#### Scenario: 读取 scheduler public facade
- **WHEN** 维护者阅读 `tools/scheduler.ts`
- **THEN** 该文件主要表达 schedule tool schema、默认 manager 和兼容导出，而不是直接承载 cron 解析、文件读写和 tick 编排的全部细节

#### Scenario: 调整 cron 语义
- **WHEN** 系统调整 cron parse、validate 或 match 逻辑
- **THEN** 维护者主要修改 scheduler cron 边界，而不是修改 store 或 tool facade

#### Scenario: 调整 schedule 持久化或 tick 编排
- **WHEN** 系统调整 `.schedule` 持久化兼容、notification queue 或 tick 行为
- **THEN** 维护者主要修改 scheduler store 或 manager 边界，而不是修改 cron 工具或 tool schema
