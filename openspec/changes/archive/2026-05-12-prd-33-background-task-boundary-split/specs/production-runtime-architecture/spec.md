## ADDED Requirements

### Requirement: Background task internals MUST separate runner manager and tool facade boundaries
后台任务工具内部 MUST 区分异步进程 runner、状态 manager 与 tool facade，使进程启动、状态流转、通知回流和对外契约可以独立演进。

#### Scenario: 读取 background task public facade
- **WHEN** 维护者阅读 `tools/background-task.ts`
- **THEN** 该文件主要表达 background tool schema、默认 manager 和兼容导出，而不是直接承载 spawn、状态流转和通知队列的全部细节

#### Scenario: 调整后台进程启动方式
- **WHEN** 系统调整后台任务子进程启动或进程句柄协议
- **THEN** 维护者主要修改 background runner 边界，而不是修改 manager 或 tool schema

#### Scenario: 调整后台任务状态或通知回流
- **WHEN** 系统调整后台任务 stdout/stderr 聚合、状态流转、通知 drain 或 observability 编排
- **THEN** 维护者主要修改 background manager 边界，而不是修改 runner 或 tool facade
