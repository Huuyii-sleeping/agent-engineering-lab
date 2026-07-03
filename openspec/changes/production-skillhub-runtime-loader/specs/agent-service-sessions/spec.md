# agent-service-sessions 规范变更

## MODIFIED Requirements

### Requirement: Agent service chat MUST enforce active Agent skill bindings

Agent service chat MUST treat session Agent context as a runtime contract, not only metadata.

#### Scenario: Bound skills are injected into prompt

- **GIVEN** a session has an Agent context with versioned skill bindings
- **WHEN** the service runs chat for that session
- **THEN** the promptSource passed to the query runtime contains only the resolved bound skills for that Agent.

#### Scenario: Bound skill loading fails before query runtime

- **GIVEN** a session has an Agent context with an unavailable skill binding
- **WHEN** the service runs chat for that session
- **THEN** the service returns `AGENT_SKILL_LOAD_FAILED`
- **AND** the query runtime is not invoked.
