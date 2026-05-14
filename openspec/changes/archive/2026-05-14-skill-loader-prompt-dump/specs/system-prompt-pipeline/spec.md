## ADDED Requirements

### Requirement: System prompt pipeline SHALL support configured skill selection and local inspection
系统 SHALL 支持从本地 skill catalog 中选择稳定 skills 注入主 `system prompt`，并允许用户通过本地 inspection surface 导出当前 prompt 结果，而不是只能在真实 query 时被动观察。

#### Scenario: Selected skills enter the stable prompt
- **WHEN** 用户通过 `AGENT_SKILLS` 选择一个或多个已发现的 skills
- **THEN** 系统将这些 skills 作为稳定 `skills` section 注入主 `system prompt`
- **AND** 未选中的 skills 不会默认进入主 prompt

#### Scenario: User dumps the current stable prompt locally
- **WHEN** 用户运行 `/prompt` 或 `agent-cli dump-system-prompt`
- **THEN** 系统输出当前稳定 `system prompt` 与 section 信息
- **AND** 不进入模型请求链路
