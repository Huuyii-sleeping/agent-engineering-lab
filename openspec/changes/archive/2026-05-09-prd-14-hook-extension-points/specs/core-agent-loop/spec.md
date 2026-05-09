## ADDED Requirements

### Requirement: Agent loop SHALL trigger hook events at fixed extension points
主循环 SHALL 在固定节点触发 Hook 事件，至少包括 `SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse` 和 `Stop`。

#### Scenario: 会话开始触发 Hook
- **WHEN** 主循环进入一次新的模型请求轮次
- **THEN** 系统在正式请求模型前触发 `SessionStart`

#### Scenario: 用户输入触发 Hook
- **WHEN** CLI 接收到一条新的用户输入
- **THEN** 系统在进入模型请求前触发 `UserPromptSubmit`

#### Scenario: 工具前后触发 Hook
- **WHEN** 主循环执行一次工具调用
- **THEN** 系统在调用前触发 `PreToolUse`，调用后触发 `PostToolUse`

#### Scenario: 轮次结束触发 Hook
- **WHEN** 一次 Agent 轮次正常结束
- **THEN** 系统触发 `Stop`
