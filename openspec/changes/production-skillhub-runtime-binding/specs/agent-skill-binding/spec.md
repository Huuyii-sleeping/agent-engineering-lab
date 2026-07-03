# agent-skill-binding 规范变更

## MODIFIED Requirements

### Requirement: Authoritative agent skill bindings

BFF MUST validate Agent skill bindings against the current installed SkillHub state before persisting an Agent profile.

#### Scenario: Reject uninstalled binding

- **GIVEN** an Agent profile payload contains a skill binding for a skill that is not installed
- **WHEN** BFF saves the Agent
- **THEN** the request is rejected with `AGENT_SKILL_BINDING_INVALID`.

#### Scenario: Reject version mismatch

- **GIVEN** an installed skill is version `1.2.0`
- **AND** an Agent profile payload binds version `1.1.0`
- **WHEN** BFF saves the Agent
- **THEN** the request is rejected with `AGENT_SKILL_BINDING_INVALID`.

#### Scenario: Complete legacy payload

- **GIVEN** an Agent profile payload only contains legacy `skillIds`
- **WHEN** all referenced skills are installed
- **THEN** BFF persists precise versioned `skills` bindings.
