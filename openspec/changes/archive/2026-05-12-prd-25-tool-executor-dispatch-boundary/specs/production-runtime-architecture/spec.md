## ADDED Requirements

### Requirement: Tool executor internals MUST separate dispatch and target execution boundaries
工具 executor 内部 MUST 区分 target dispatch、builtin/subagent execution 与 MCP execution，使不同工具目标的执行策略可以独立演进。

#### Scenario: 读取工具 executor 实现
- **WHEN** 维护者阅读 `tools/executor.ts`
- **THEN** 该文件主要根据工具 target 分发到专门 executor，而不是直接承载 builtin handler 解析和 MCP runner 调用的全部细节

#### Scenario: 调整 builtin 或 subagent 工具执行
- **WHEN** 系统调整 builtin 或 subagent 工具 handler 解析、preview 或 replay metadata 传递
- **THEN** 维护者主要修改 builtin executor 边界，而不是修改 MCP execution 或 query runtime

#### Scenario: 调整 MCP 工具执行
- **WHEN** 系统调整 MCP 工具调用、fallback 或 protected execution 包装
- **THEN** 维护者主要修改 MCP executor 边界，而不是修改 builtin execution 或 query runtime
