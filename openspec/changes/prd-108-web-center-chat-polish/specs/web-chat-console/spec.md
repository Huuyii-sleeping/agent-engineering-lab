## MODIFIED Requirements

### Requirement: Web Chat Console MUST provide a polished Chat-first layout
Web Chat Console MUST present a modern Chat-first interface with left navigation/history, central transcript, and a persistent composer while preserving the existing BFF-backed workflow.

#### Scenario: User opens an empty conversation
- **WHEN** active session has no messages
- **THEN** the center area shows a large new-conversation prompt
- **AND** it does not show backend forwarding implementation text

#### Scenario: User views conversation header
- **WHEN** the Web Console has an active or pending conversation
- **THEN** the title area shows a concise runtime state such as `idle`, `loading`, `running`, or `completed`

#### Scenario: User focuses the composer
- **WHEN** the composer input receives focus
- **THEN** the composer does not show an accent-colored focus halo or green border
- **AND** the composer toolbar shows compact keyboard shortcut hints
