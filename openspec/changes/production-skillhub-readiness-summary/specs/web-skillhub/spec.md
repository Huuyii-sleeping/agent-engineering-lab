# web-skillhub 规范变更

## ADDED Requirements

### Requirement: Web SHALL display SkillHub readiness summary

SkillHub MUST display a top-level readiness summary for registry and lifecycle health.

#### Scenario: Registry sync succeeds

- **GIVEN** registry sync has succeeded
- **WHEN** SkillHub is displayed
- **THEN** Web displays that the registry is synced
- **AND** Web displays installed, update available, and failed event counts.

#### Scenario: Registry sync has error

- **GIVEN** registry sync has a last sync error
- **WHEN** SkillHub is displayed
- **THEN** Web displays that SkillHub needs attention.

#### Scenario: Registry state is not loaded

- **GIVEN** registry settings are not loaded yet
- **WHEN** SkillHub is displayed
- **THEN** Web displays that it is waiting for sync.
