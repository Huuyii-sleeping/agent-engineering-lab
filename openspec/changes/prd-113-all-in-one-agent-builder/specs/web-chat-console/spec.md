## MODIFIED Requirements

### Requirement: Web Chat Console MUST provide an Agent Builder workspace
Web Chat Console MUST provide an Agent Builder workspace for configuring an all-in-one local agent beyond single chat sessions.

#### Scenario: User opens Agent Builder
- **WHEN** 用户点击侧栏的应用生成入口
- **THEN** 主区域切换到 Agent Builder 工作台
- **AND** 工作台展示 skill 池、SOP 编排区和 Agent 配置预览

#### Scenario: User opens the default Web Console
- **WHEN** 用户打开 Web Console
- **THEN** 主区域默认保持原聊天工作台
- **AND** Agent Builder 作为应用生成子页面存在，不替换聊天首页

#### Scenario: User selects skills for an agent
- **WHEN** 用户在 skill 池中选择或取消一个 skill
- **THEN** 该 skill 的选中状态立即更新
- **AND** Agent 配置预览展示最新 skill 列表

#### Scenario: User assembles SOP steps
- **WHEN** 用户在 SOP 编排区选择或取消一个步骤
- **THEN** 该步骤的选中状态立即更新
- **AND** Agent 配置预览展示最新 SOP 流程

#### Scenario: User edits builder metadata
- **WHEN** 用户修改 agent 名称或适用场景
- **THEN** Web Console 本地保存配置
- **AND** 页面刷新后恢复该配置

#### Scenario: User returns to chat
- **WHEN** 用户点击聊天入口或历史会话
- **THEN** 主区域切回聊天工作台
- **AND** 已保存的 Agent Builder 配置不丢失
