## ADDED Requirements

### Requirement: Session surfaces MUST disclose local persistence contracts
session 相关 surface MUST 明确披露本地会保存哪些会话数据，至少包括 session metadata、transcript/history、agent 或 subagent 状态摘要，以及它们各自的用途、保留语义与删除语义。

#### Scenario: User inspects session persistence
- **WHEN** 用户检查 session 数据治理信息
- **THEN** 系统列出当前本地保存的 session 相关数据类别及其主要用途
- **AND** 说明这些数据如何支持 resume、检索、标题生成、上下文连续性或其他本地功能

#### Scenario: Session retention contract is surfaced
- **WHEN** session 或 transcript 数据已经接入 retention / delete contract
- **THEN** 系统在治理信息中展示对应的保留与删除语义
- **AND** 不要求用户分别阅读底层持久化实现才能知道这些行为
