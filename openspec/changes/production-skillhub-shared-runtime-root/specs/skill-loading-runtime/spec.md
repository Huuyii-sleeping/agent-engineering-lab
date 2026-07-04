# skill-loading-runtime 规范变更

## MODIFIED Requirements

### Requirement: Agent SHALL resolve SkillHub package roots from shared runtime configuration

Agent runtime MUST support `SKILLHUB_DATA_ROOT` as the default SkillHub package root when no Agent-specific root override is configured.

#### Scenario: Use shared SkillHub root

- **GIVEN** `SKILLHUB_DATA_ROOT` points to a local SkillHub package root
- **AND** `AGENT_SKILLHUB_ROOTS` is not set
- **WHEN** Agent runtime resolves SkillHub roots
- **THEN** it uses `SKILLHUB_DATA_ROOT`.

#### Scenario: Agent-specific roots override shared root

- **GIVEN** both `AGENT_SKILLHUB_ROOTS` and `SKILLHUB_DATA_ROOT` are set
- **WHEN** Agent runtime resolves SkillHub roots
- **THEN** it uses `AGENT_SKILLHUB_ROOTS`.
