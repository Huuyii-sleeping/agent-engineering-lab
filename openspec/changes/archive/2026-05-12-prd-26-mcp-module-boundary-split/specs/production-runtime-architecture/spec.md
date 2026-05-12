## ADDED Requirements

### Requirement: MCP tool internals MUST separate config and protocol utilities from client registry runtime
MCP 工具内部 MUST 区分配置加载、协议/输出工具函数与 client/registry runtime，使配置格式、协议解析、输出归一化和进程生命周期可以独立演进。

#### Scenario: 调整 MCP 配置读取
- **WHEN** 系统调整 MCP server 配置默认值、路径解析或 enabled 过滤规则
- **THEN** 维护者主要修改 MCP config 边界，而不是修改 JSON-RPC client 生命周期或 registry retry 逻辑

#### Scenario: 调整 MCP 协议解析或输出归一化
- **WHEN** 系统调整 tools/list 解析、tools/call 结果归一化或结构化失败输出
- **THEN** 维护者主要修改 MCP protocol/output 边界，而不是修改配置加载或 registry cache 逻辑

#### Scenario: 读取 MCP public API
- **WHEN** 维护者阅读 `tools/mcp.ts`
- **THEN** 该文件主要表达 MCP client、registry 和 public API 组合，而不是直接承载配置解析与输出归一化的全部细节
