## ADDED Requirements

### Requirement: Delivery internals MUST separate plan runner report store and public facade boundaries
Delivery 内部 MUST 区分 stage plan、command runner、report store 与 public facade，使验证阶段选择、执行策略、报告持久化和工具输出可以独立演进。

#### Scenario: 调整验证阶段计划
- **WHEN** 系统调整 package script 探测、stage 列表或 skip 条件
- **THEN** 维护者主要修改 delivery plan 边界，而不是修改 command runner 或 report store

#### Scenario: 调整执行或失败分类
- **WHEN** 系统调整 command execution、retry、failure classify 或 stage observability
- **THEN** 维护者主要修改 delivery runner 边界，而不是修改 plan 或 tool facade

#### Scenario: 读取 delivery public facade
- **WHEN** 维护者阅读 `src/delivery.ts`
- **THEN** 该文件主要表达 public validation 编排与 tool-facing handlers，而不是直接承载 plan、runner 和 report store 的全部细节
