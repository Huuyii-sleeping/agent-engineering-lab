## ADDED Requirements

### Requirement: MCP runtime internals MUST separate client lifecycle registry cache and public API facade
MCP runtime 内部 MUST 区分 server client lifecycle、registry/cache/runner 与 public API facade，使外部进程通信、工具注册缓存和工具总线入口可以独立演进。

#### Scenario: 调整 MCP server lifecycle
- **WHEN** 系统调整 MCP server 启动、初始化、JSON-RPC request、stdout frame parse 或 close 行为
- **THEN** 维护者主要修改 MCP client 边界，而不是修改 registry cache 或 public API facade

#### Scenario: 调整 MCP registry 或 retry
- **WHEN** 系统调整 MCP 工具 alias、registration cache、retry 或 call observability
- **THEN** 维护者主要修改 MCP registry 边界，而不是修改 client lifecycle 或 tool executor

#### Scenario: 读取 MCP public API
- **WHEN** 维护者阅读 `tools/mcp.ts`
- **THEN** 该文件主要表达 active registry 装配与 public API，而不是直接承载 client lifecycle 和 registry runner 的全部细节
