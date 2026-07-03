# web-skillhub 规范变更

## MODIFIED Requirements

### Requirement: Agent binding health

Web Agent configuration MUST show whether saved skill bindings still match installed SkillHub state.

#### Scenario: Show stale binding

- **GIVEN** an Agent has a saved skill binding at version `1.1.0`
- **AND** the installed skill version is `1.2.0`
- **WHEN** the Agent configuration renders
- **THEN** the binding is marked as version drift.

#### Scenario: Pass runtime context

- **GIVEN** an active Agent has versioned skill bindings
- **WHEN** Web creates a session or sends a message
- **THEN** the request includes the Agent id, name and skill bindings.
