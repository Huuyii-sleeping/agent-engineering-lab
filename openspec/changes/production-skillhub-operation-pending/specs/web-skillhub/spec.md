# web-skillhub 规范变更

## ADDED Requirements

### Requirement: Web SHALL show pending lifecycle operation state

SkillHub MUST show and enforce a pending state while a lifecycle operation is running.

#### Scenario: Primary lifecycle operation is running

- **GIVEN** a Skill download, install, update, or uninstall request is running
- **WHEN** SkillHub is displayed
- **THEN** Web disables lifecycle action buttons
- **AND** Web displays the running Skill action as processing.

#### Scenario: Rollback lifecycle operation is running

- **GIVEN** a Skill rollback request is running
- **WHEN** SkillHub is displayed
- **THEN** Web disables lifecycle action buttons
- **AND** Web displays the running rollback action as processing.

#### Scenario: Lifecycle operation finishes

- **GIVEN** a lifecycle request succeeds or fails
- **WHEN** the request settles
- **THEN** Web clears the pending lifecycle operation state.
