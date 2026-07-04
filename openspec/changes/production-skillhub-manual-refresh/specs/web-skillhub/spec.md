# web-skillhub 规范变更

## ADDED Requirements

### Requirement: Web SHALL allow manual SkillHub registry refresh

SkillHub MUST provide a manual refresh action for the registry and skill list.

#### Scenario: Registry refresh is available

- **GIVEN** SkillHub is displayed
- **WHEN** no registry refresh is running
- **THEN** Web displays a refresh registry action.

#### Scenario: Registry refresh is running

- **GIVEN** a registry refresh request is running
- **WHEN** SkillHub is displayed
- **THEN** Web disables the refresh action
- **AND** Web displays that syncing is in progress.

#### Scenario: Registry refresh is triggered

- **GIVEN** the user clicks refresh registry
- **WHEN** the request starts
- **THEN** Web reuses the existing registry sync and Skill list refresh flow.
