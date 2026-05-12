## ADDED Requirements

### Requirement: Subagent internals MUST separate executor manager and tool facade boundaries
子代理工具内部 MUST 区分模型/tool-calling executor、生命周期 manager 与 tool facade，使模型调用、状态流转、通知回流和对外契约可以独立演进。

#### Scenario: 读取 subagent public facade
- **WHEN** 维护者阅读 `tools/subagent.ts`
- **THEN** 该文件主要表达 subagent tool schema、默认 manager 和兼容导出，而不是直接承载生命周期状态表、模型执行循环和通知编排的全部细节

#### Scenario: 调整子代理模型执行方式
- **WHEN** 系统调整子代理模型选择、fallback 或 tool loop 行为
- **THEN** 维护者主要修改 subagent executor 边界，而不是修改 manager 或 tool schema

#### Scenario: 调整子代理生命周期或通知
- **WHEN** 系统调整子代理 spawn/send/wait/close、状态流转、notification drain 或 observability 编排
- **THEN** 维护者主要修改 subagent manager 边界，而不是修改 executor 或 tool facade
