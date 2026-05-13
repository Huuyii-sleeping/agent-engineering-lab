## ADDED Requirements

### Requirement: QueryToolStage boundary corrections MUST preserve tool hook blocking and message injection semantics
QueryToolStage 边界校正 MUST 保持 PreToolUse / PostToolUse hook 阻断、补充消息注入和结构化工具输出语义不变。

#### Scenario: PreToolUse hook 阻断工具
- **WHEN** PreToolUse hook 返回 blocked
- **THEN** 系统继续不执行底层工具，并回填包含 `HOOK_BLOCKED` 的结构化 tool output

#### Scenario: hook 注入补充消息
- **WHEN** PreToolUse 或 PostToolUse hook 返回补充 messages
- **THEN** 系统继续将这些消息按原有位置追加为 system messages

#### Scenario: PostToolUse hook 接收工具结果
- **WHEN** 工具未被 PreToolUse 阻断并完成执行
- **THEN** PostToolUse hook 继续接收 tool name、arguments、output、ok 和 error code
