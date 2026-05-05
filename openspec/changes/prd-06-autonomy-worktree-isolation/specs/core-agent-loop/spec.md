## MODIFIED Requirements

### Requirement: Agent loop SHALL handle tool-calling rounds deterministically
主循环 MUST 在每轮前支持自治轮询入口，并在不破坏既有工具调用契约的前提下处理自治状态更新。

#### Scenario: 自治入口与主循环兼容
- **WHEN** 主循环进入新一轮
- **THEN** 自治检查先执行，随后保持原有 tool-calling 顺序和回填流程
