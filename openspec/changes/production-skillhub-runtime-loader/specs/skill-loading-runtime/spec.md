# skill-loading-runtime 规范变更

## MODIFIED Requirements

### Requirement: Agent SHALL load version-bound SkillHub packages for Agent runtime

Agent runtime MUST resolve versioned SkillHub bindings from the active Agent context before executing a chat round.

#### Scenario: Load bound remote skill package

- **GIVEN** a session has an Agent context binding skill `remote-review` at version `1.2.0`
- **AND** `AGENT_SKILLHUB_ROOTS` contains a package at `remote/remote-review/1.2.0`
- **WHEN** chat executes for that session
- **THEN** the runtime loads that exact package into the skills prompt section.

#### Scenario: Reject missing bound package

- **GIVEN** a session has an Agent context binding skill `missing-skill` at version `1.0.0`
- **AND** no matching local SkillHub package exists
- **WHEN** chat executes for that session
- **THEN** the runtime returns `AGENT_SKILL_LOAD_FAILED`
- **AND** the model request is not started.

#### Scenario: Preserve no-Agent fallback

- **GIVEN** a chat request has no Agent context
- **WHEN** chat executes
- **THEN** the runtime keeps using the existing global promptSource skill behavior.
