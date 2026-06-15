## MODIFIED Requirements

### Requirement: Web Chat Console MUST provide a polished Chat-first layout
Web Chat Console MUST present a modern Chat-first interface with left navigation/history, central transcript, and a persistent composer while preserving the existing BFF-backed workflow.

#### Scenario: User opens the Web Chat Console
- **WHEN** the Web Console loads
- **THEN** the page shows a left navigation/history rail
- **AND** the center area shows the active conversation or empty Chat state
- **AND** the composer remains available at the bottom of the Chat area
- **AND** visible header controls render as recognizable controls without stray text or placeholder characters

#### Scenario: Agent is unavailable
- **WHEN** health or session loading fails
- **THEN** the page keeps the Chat layout visible
- **AND** it shows an explicit disconnected/error state with a retry control

### Requirement: Web Chat Console MUST use BFF APIs only
Web Chat Console MUST 通过 BFF `/api/*` 访问 agent 能力，不得直接调用 agent runtime、agent service 或读取 agent 本地运行文件。

#### Scenario: Web loads health and sessions through BFF
- **WHEN** Web Chat Console 初始化
- **THEN** 它调用 BFF health 与 sessions API
- **AND** 页面显示连接状态和 session 列表

#### Scenario: Web does not read local agent files
- **WHEN** Web Console 运行在 Vite dev 环境
- **THEN** `/api/*` 请求通过 proxy 转发到 BFF
- **AND** Vite config 不再读取 `.tasks`、`.runtime` 或 `.observability` 文件
- **AND** Web 文档说明当前 BFF-backed Chat Console 边界
