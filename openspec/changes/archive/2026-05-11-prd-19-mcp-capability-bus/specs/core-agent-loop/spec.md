## MODIFIED Requirements

### Requirement: Agent loop SHALL handle tool-calling rounds deterministically
主循环 MUST 在每轮前支持自治轮询入口，并在不破坏既有工具调用契约的前提下处理统一工具路由，包括 native、subagent 与 MCP 外部工具。

#### Scenario: 同一轮内混合调用 native 与 MCP 工具
- **WHEN** 模型在同一轮工具调用中同时请求原生工具与 MCP 工具
- **THEN** 主循环按返回顺序执行统一 router，并将每个工具结果按既有 `role: tool` 契约回填
