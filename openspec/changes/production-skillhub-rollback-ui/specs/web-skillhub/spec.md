# web-skillhub 规范变更

## ADDED Requirements

### Requirement: Web SHALL expose Skill rollback when a previous local version exists

Skill Hub MUST allow users to roll an installed Skill back to its previous local installed version when that rollback target is available.

#### Scenario: Rollback target is available

- **GIVEN** a Skill is installed
- **AND** the Skill has a non-empty `previousInstalledVersion`
- **WHEN** the Skill card is displayed
- **THEN** Web displays the previous installed version
- **AND** Web displays a rollback action.

#### Scenario: User rolls back a Skill

- **GIVEN** a Skill rollback action is visible
- **WHEN** the user triggers rollback
- **THEN** Web calls the rollback API for that Skill
- **AND** Web replaces the Skill card state with the API response.

#### Scenario: No rollback target exists

- **GIVEN** a Skill is installed
- **AND** the Skill has no `previousInstalledVersion`
- **WHEN** the Skill card is displayed
- **THEN** Web does not display a rollback action.
