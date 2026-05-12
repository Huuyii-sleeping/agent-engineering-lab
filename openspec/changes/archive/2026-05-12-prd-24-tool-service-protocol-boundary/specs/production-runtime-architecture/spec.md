## ADDED Requirements

### Requirement: Tool service internals MUST separate catalog and execution boundaries
工具服务内部 MUST 区分工具目录能力与工具执行能力，使工具来源、metadata/schema 暴露和执行分发可以独立演进。

#### Scenario: 读取工具服务实现
- **WHEN** 维护者阅读 `tools/service.ts`
- **THEN** 该文件主要组合工具 catalog 与 executor，而不是直接承载工具列表、metadata 转换和执行分发的全部细节

#### Scenario: 新增工具来源
- **WHEN** 系统新增一种工具来源或 metadata 暴露规则
- **THEN** 维护者主要修改工具 catalog 边界，而不是修改 query runtime 或工具执行分发逻辑

#### Scenario: 调整工具执行分发
- **WHEN** 系统调整 builtin、subagent 或 MCP 工具执行路由
- **THEN** 维护者主要修改工具 executor 边界，而不是修改工具 catalog 或 query runtime
