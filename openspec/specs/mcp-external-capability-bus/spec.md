# mcp-external-capability-bus Specification

## Purpose
定义外部 MCP server 的接入、生命周期管理与统一工具契约，使外部能力能安全进入 Agent 工具总线。
## Requirements
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

### Requirement: MCP metadata and outputs MUST be sanitized before exposure
外部 MCP server 的工具描述和工具输出 MUST 在进入本地 runtime 前完成隐藏字符清洗与 secret-like 内容脱敏。

#### Scenario: 外部工具描述包含隐藏字符
- **WHEN** MCP server 的 `tools/list` 返回带有 bidi、隐藏控制字符或敏感片段的 description
- **THEN** 本地工具注册暴露清洗后的 description

#### Scenario: 外部工具输出包含敏感片段
- **WHEN** MCP tool 返回 text content 或 structured content，且其中包含 secret-like 字符串
- **THEN** 本地归一化输出返回脱敏后的结果
- **AND** 原始敏感值不得直接进入会话工具结果文本

### Requirement: MCP registration MUST expose provenance and enforce trust policy
MCP server 接入 MUST 为本地注册结果提供 server 来源、身份摘要与 capability provenance，并在执行前经过 trust policy / allowlist 判断，而不是把所有外部能力默认视为同等可信。

#### Scenario: Untrusted MCP server is discovered
- **WHEN** 系统发现未被信任策略允许的 MCP server 或 remote capability
- **THEN** 系统阻止其默认进入可执行工具集合，或要求显式信任/审批

#### Scenario: Client inspects one MCP capability
- **WHEN** 用户或本地控制面查看某个 MCP 工具
- **THEN** 系统返回该工具对应的 server 来源与 provenance 摘要

### Requirement: MCP auth material MUST not be overexposed to local surfaces
MCP 配置中的认证材料、凭据衍生信息与高敏感连接元数据 MUST 不得被普通工具结果、日志或 inspection surface 直接暴露。

#### Scenario: MCP server uses credentials to initialize
- **WHEN** MCP server 通过 token、api key 或等效凭据启动并完成调用
- **THEN** 本地可见日志、事件与工具输出不直接暴露对应认证材料

### Requirement: MCP loading MUST support privacy-minimized disable or explicit allowlist mode
MCP 外部能力接入 MUST 支持 `disabled`、`explicit_allowlist` 或等价隐私最小化姿态，使用户可以阻断项目配置中的外部 server 自动进入可执行工具集合，而不只是依赖 trust policy 在发现后再决策。

#### Scenario: External capabilities are disabled
- **WHEN** 用户启用 external capabilities disabled 或等价隐私姿态
- **THEN** 系统不自动加载项目配置中的 MCP servers
- **AND** 不把外部工具暴露为默认可执行能力

#### Scenario: Allowlist mode is enabled
- **WHEN** 用户启用 explicit allowlist 或等价隐私姿态
- **THEN** 系统只加载被显式允许的 MCP servers 或 tools
- **AND** 其他外部能力保持未激活状态

