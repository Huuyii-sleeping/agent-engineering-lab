## ADDED Requirements

### Requirement: QueryFinalization boundary corrections MUST preserve stop reason and round counter semantics
QueryFinalization 边界校正 MUST 保持 assistant-only / tool-driven stopReason 与 `roundsWithoutTodo` 更新语义不变。

#### Scenario: assistant-only 收尾
- **WHEN** 模型返回无工具调用的 assistant response
- **THEN** 系统继续返回 `assistant_response` 并递增 `roundsWithoutTodo`

#### Scenario: tool-driven 收尾使用 todo
- **WHEN** 工具轮次使用 todo
- **THEN** 系统继续将 `roundsWithoutTodo` 重置为 0

#### Scenario: tool-driven 收尾未使用 todo
- **WHEN** 工具轮次未使用 todo
- **THEN** 系统继续递增 `roundsWithoutTodo`
