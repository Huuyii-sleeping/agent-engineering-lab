# agent-service-runtime 规范变更

## MODIFIED Requirements

### Requirement: Session agent context

Agent service sessions MUST accept and persist the Agent context supplied by BFF.

#### Scenario: Create session with Agent context

- **GIVEN** BFF creates a session with Agent context
- **WHEN** agent service stores the session
- **THEN** session summary and detail include that Agent context.

#### Scenario: Chat updates Agent context

- **GIVEN** a session exists
- **WHEN** a chat request includes Agent context
- **THEN** the session record stores the latest Agent context before running the message.
