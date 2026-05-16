## ADDED Requirements

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

