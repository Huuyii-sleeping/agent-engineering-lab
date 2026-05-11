## ADDED Requirements

### Requirement: Agent SHALL load MCP servers from project configuration
系统 SHALL 从项目级配置加载 MCP server 定义，并将其外部工具注册为主代理可见能力，而不是把外部工具硬编码进主循环。

#### Scenario: 配置 server 后自动暴露工具
- **WHEN** 工作区存在启用状态的 MCP server 配置
- **THEN** 系统启动工具清单时会自动加载该 server 的工具定义

### Requirement: MCP client SHALL manage external server lifecycle
系统 SHALL 负责外部 MCP server 的启动、初始化、请求发送、响应接收、异常退出处理与必要重启。

#### Scenario: 首次调用前自动初始化 server
- **WHEN** 某个 MCP 工具首次被列出或调用
- **THEN** 系统先完成对应 server 的启动与初始化，再执行后续 `tools/list` 或 `tools/call`

#### Scenario: server 异常退出后可恢复
- **WHEN** 外部 MCP server 在调用期间异常退出或连接失效
- **THEN** 系统返回结构化错误，并在后续调用时按预算尝试重建连接

### Requirement: MCP tool results MUST use the same structured tool contract
外部 MCP 工具返回结果 MUST 使用与原生工具一致的工具回填契约；失败时 MUST 返回 `{ ok:false, error:{ code, message } }` 结构。

#### Scenario: 外部工具成功返回结构化内容
- **WHEN** MCP tool 正常完成调用
- **THEN** 系统将其结果转换为统一的工具输出字符串并回填到会话历史

#### Scenario: 外部工具调用失败
- **WHEN** `tools/call` 超时、报错或返回错误态
- **THEN** 系统回填结构化失败结果，而不是抛裸异常

### Requirement: MCP tools MUST honor security and observability boundaries
MCP 工具 MUST 经过统一安全门禁与观测链路，不得绕开审批、审计或执行事件记录。

#### Scenario: 外部工具触发审批边界
- **WHEN** MCP 工具命中安全策略中的审批要求
- **THEN** 系统阻止执行并返回与原生工具一致的审批错误

#### Scenario: 外部工具失败被记录
- **WHEN** MCP 工具调用失败
- **THEN** 系统写入对应观测事件，包含 server、tool、错误码和摘要
