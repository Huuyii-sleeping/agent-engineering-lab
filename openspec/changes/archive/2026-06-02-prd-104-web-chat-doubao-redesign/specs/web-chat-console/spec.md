## ADDED Requirements

### Requirement: Web Chat Console MUST provide a polished Chat-first layout
Web Chat Console MUST present a modern Chat-first interface with left navigation/history, central transcript, and a persistent composer while preserving the existing BFF-backed workflow.

#### Scenario: User opens the Web Chat Console
- **WHEN** the Web Console loads
- **THEN** the page shows a left navigation/history rail
- **AND** the center area shows the active conversation or empty Chat state
- **AND** the composer remains available at the bottom of the Chat area

#### Scenario: Agent is unavailable
- **WHEN** health or session loading fails
- **THEN** the page keeps the Chat layout visible
- **AND** it shows an explicit disconnected/error state with a retry control

### Requirement: Web Chat Console MUST support theme switching
Web Chat Console MUST support token-driven light and dark themes that can be toggled by the user and persisted locally.

#### Scenario: User toggles theme
- **WHEN** the user clicks the theme toggle
- **THEN** the app switches between light and dark themes
- **AND** the selected theme is stored locally
- **AND** the root document theme attribute is updated
