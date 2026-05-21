## ADDED Requirements

### Requirement: Team inbox SHALL support unread tracking and explicit acknowledgment

team inbox SHALL 提供 unread 计数与显式 ack 语义，避免读取后仍重复重放同一批消息。

#### Scenario: User reads inbox without ack

- **WHEN** 模型调用 `team_read_inbox`
- **THEN** 系统 SHALL 返回 messages 与 unread 计数
- **AND** 读取本身 SHALL 不改变 unread 游标

#### Scenario: User acknowledges inbox messages

- **WHEN** 模型调用 `team_mark_inbox_read`
- **THEN** 系统 SHALL 更新该 teammate 的 inbox 游标
- **AND** 后续 `team_read_inbox` SHALL 仅把新消息计为 unread

