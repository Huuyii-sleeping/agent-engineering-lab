## MODIFIED Requirements

### Requirement: Web Chat Console MUST provide a landing page and tabbed workspace
Web Chat Console MUST provide an introductory landing page and a tabbed workspace for all-in-one local agent capabilities beyond a single chat surface.

#### Scenario: User opens the default Web Console
- **WHEN** 用户打开 Web Console
- **THEN** 页面展示项目介绍首页
- **AND** 首页提供“立即开始”入口

#### Scenario: User enters the workspace
- **WHEN** 用户点击“立即开始”
- **THEN** 页面进入工作台
- **AND** 工作台展示 Tab 导航
- **AND** 默认选中 `Agent 测试` Tab

#### Scenario: User opens Agent test tab
- **WHEN** 用户选择 `Agent 测试` Tab
- **THEN** 主区域展示原聊天测试页面
- **AND** 用户仍可创建会话、选择历史会话和发送消息

#### Scenario: User opens Skill loading tab
- **WHEN** 用户选择 `Skill 加载` Tab
- **THEN** 主区域展示 SkillHub 风格的 skill 列表
- **AND** 每个 skill 展示名称、分类、来源、版本和下载状态

#### Scenario: User toggles skill download state
- **WHEN** 用户点击 skill 的下载按钮
- **THEN** 该 skill 的下载状态立即更新
- **AND** 页面刷新后恢复下载状态

#### Scenario: User returns to chat
- **WHEN** 用户点击 `Agent 测试` Tab 或历史会话
- **THEN** 主区域切回聊天测试页
