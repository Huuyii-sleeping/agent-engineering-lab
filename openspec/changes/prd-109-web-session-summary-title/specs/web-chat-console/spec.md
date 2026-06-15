## MODIFIED Requirements

### Requirement: Web Chat Console MUST support local session list management
Web Chat Console MUST support lightweight local management for the visible session list without changing agent service session persistence.

#### Scenario: Session has user messages and no custom title
- **WHEN** 用户查看历史对话列表或会话标题
- **THEN** Web 使用首条用户消息生成简短摘要标题
- **AND** 不展示 `会话 + hash` 作为主要标题

#### Scenario: Session has no user messages
- **WHEN** 用户查看空会话
- **THEN** Web 显示 `新对话`
- **AND** 不展示 `会话 + hash` 作为主要标题

#### Scenario: Session is renamed by user
- **WHEN** 用户手动重命名会话
- **THEN** Web 优先展示用户自定义标题
- **AND** 不用本地摘要覆盖用户自定义标题
