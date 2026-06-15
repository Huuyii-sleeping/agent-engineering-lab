## MODIFIED Requirements

### Requirement: Web Chat Console MUST provide a polished Chat-first layout
Web Chat Console MUST present a modern Chat-first interface with left navigation/history, central transcript, and a persistent composer while preserving the existing BFF-backed workflow.

#### Scenario: User opens the Web Chat Console
- **WHEN** the Web Console loads
- **THEN** the page shows a branded left navigation/history rail
- **AND** placeholder feature entries are clearly marked as pending development
- **AND** the center area shows the active conversation or empty Chat state
- **AND** the composer remains available at the bottom of the Chat area
- **AND** visible command controls prefer recognizable icons over repeated text labels
- **AND** page icons are rendered from a consistent mature icon library
- **AND** message role labels and avatars are rendered outside message body content
- **AND** user and assistant message body content is rendered inside visually distinct chat bubbles

#### Scenario: User sees sidebar settings entry
- **WHEN** 用户查看左侧导航底部
- **THEN** Web 显示仅图标形式的个人设置入口
- **AND** 该区域可承载个人设置、偏好设置和系统设置

#### Scenario: User toggles the sidebar
- **WHEN** 用户点击左上角侧栏按钮
- **THEN** Web 平滑折叠或展开左侧导航与历史区域
- **AND** 当前 session、草稿和 transcript 不丢失

### Requirement: Web Chat Console MUST support local session list management
Web Chat Console MUST support lightweight local management for the visible session list without changing agent service session persistence.

#### Scenario: User opens a session action menu
- **WHEN** 用户查看历史对话列表
- **THEN** 每个 session 行只显示一个紧凑的操作入口
- **AND** 删除、重命名、置顶操作在子菜单中展示

#### Scenario: User renames a session
- **WHEN** 用户在历史对话中执行重命名
- **THEN** Web 保存该 session 的本地展示名称
- **AND** 历史列表和标题区域使用新名称展示

#### Scenario: User pins a session
- **WHEN** 用户在历史对话中执行置顶
- **THEN** 该 session 在历史列表中排在非置顶 session 前面
- **AND** 置顶状态在浏览器本地持久化

#### Scenario: User deletes a session from the list
- **WHEN** 用户在历史对话中执行删除
- **THEN** Web 从历史列表隐藏该 session
- **AND** 不直接删除 agent service 的真实 session 文件

### Requirement: Web Chat Console MUST expose clear runtime states
Web Chat Console MUST 清晰展示 loading、busy、empty、error、disconnected 和 SSE 连接状态，避免用户无法判断 agent 是否可用或请求是否仍在执行。

#### Scenario: Runtime is connected
- **WHEN** BFF、agent service 与 SSE 均可用
- **THEN** 顶部操作区显示紧凑的图标化连接状态
- **AND** 左侧底部不显示额外连接状态块

#### Scenario: Runtime is partially unavailable
- **WHEN** BFF、agent service 或 SSE 任一不可用
- **THEN** 顶部操作区显示对应的异常状态
- **AND** 左侧底部不显示额外连接状态块
