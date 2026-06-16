## MODIFIED Requirements

### Requirement: Web Chat Console MUST provide a settings page
Web Chat Console MUST provide an in-app personal settings page reachable from the sidebar.

#### Scenario: User opens personal settings
- **WHEN** 用户点击侧栏底部个人设置入口
- **THEN** 主区域切换到个人设置页
- **AND** 设置页展示个人资料、界面偏好和运行状态信息

#### Scenario: User returns from settings
- **WHEN** 用户在设置页点击返回聊天
- **THEN** 主区域切回当前聊天会话

#### Scenario: User opens a settings section
- **WHEN** 用户点击偏好设置或系统设置入口
- **THEN** 设置页打开并定位到对应分区
