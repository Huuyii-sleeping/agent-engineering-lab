## ADDED Requirements

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
