## ADDED Requirements

### Requirement: QueryToolStage boundary corrections MUST preserve tool result task and side effect semantics
QueryToolStage 边界校正 MUST 保持工具调用顺序、tool result 回填、写副作用标记和 task/todo 同步语义不变。

#### Scenario: 回填工具结果
- **WHEN** 模型返回 function tool calls
- **THEN** 系统继续按返回顺序执行，并为每个工具结果追加相同 shape 的 `role: tool` message

#### Scenario: 成功写工具产生副作用
- **WHEN** 写类工具成功执行
- **THEN** 系统继续标记 `wroteWorkspaceFiles` 并记录 touched paths，用于后续自动 delivery

#### Scenario: todo 完成触发 active task 自动完成
- **WHEN** 当前存在 active task 且 todo 工具将所有 items 标记为 completed
- **THEN** 系统继续自动调用 `task_update` 将 active task 标记为 completed，并清空 active task
