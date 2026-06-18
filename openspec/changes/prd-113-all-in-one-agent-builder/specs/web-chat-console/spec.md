## MODIFIED Requirements

### Requirement: Web Chat Console MUST provide a landing page and Agent management workspace
Web Chat Console MUST provide an introductory landing page and an Agent management workspace for all-in-one local agent capabilities beyond a single chat surface.

#### Scenario: User opens the default Web Console
- **WHEN** 用户打开 Web Console
- **THEN** 页面展示项目介绍首页
- **AND** 首页提供“立即开始”入口

#### Scenario: User enters the workspace
- **WHEN** 用户点击“立即开始”
- **THEN** 页面进入 Agent 管理界面
- **AND** 页面展示 agent 列表和当前 agent 详情

#### Scenario: User creates an agent
- **WHEN** 用户点击新建 agent
- **THEN** Web Console 调用 BFF 创建 agent
- **AND** 新 agent 出现在 Agent 管理列表中

#### Scenario: User edits an agent
- **WHEN** 用户修改 agent 名称、描述、场景、skills、actions 或 system prompt
- **THEN** Web Console 调用 BFF 保存 agent
- **AND** 管理界面展示保存后的 agent 配置

#### Scenario: User deletes an agent
- **WHEN** 用户删除当前 agent
- **THEN** Web Console 调用 BFF 删除 agent
- **AND** 被删除 agent 从列表中移除

#### Scenario: User tests an agent
- **WHEN** 用户点击“使用 / 测试”当前 agent
- **THEN** 主区域切换到原聊天测试页
- **AND** 页面展示当前测试 agent 的摘要
- **AND** 用户仍可创建会话、选择历史会话和发送消息
