# skill-loading-runtime 规范变更

## ADDED Requirements

### Requirement: Agent runtime SHALL expose Skill binding preflight

Agent runtime MUST expose a preflight operation that validates Agent Skill bindings without starting a chat round.

#### Scenario: Resolve bound skills

- **GIVEN** an Agent context with loadable version-bound skills
- **WHEN** the preflight operation runs
- **THEN** it returns `ok: true`
- **AND** returns non-sensitive summaries of resolved skills.

#### Scenario: Reject missing skill during preflight

- **GIVEN** an Agent context with a missing bound skill
- **WHEN** the preflight operation runs
- **THEN** it returns `AGENT_SKILL_LOAD_FAILED`
- **AND** it does not start the query runtime.
