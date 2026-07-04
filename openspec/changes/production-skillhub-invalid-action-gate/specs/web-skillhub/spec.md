# web-skillhub 规范变更

## ADDED Requirements

### Requirement: Web SHALL block invalid Skill lifecycle actions

SkillHub MUST prevent invalid Skill entries from triggering primary lifecycle actions.

#### Scenario: Invalid Skill is displayed

- **GIVEN** a Skill has status `invalid`
- **WHEN** SkillHub is displayed
- **THEN** Web displays the primary action as unavailable
- **AND** Web disables the primary lifecycle action.

#### Scenario: Invalid Skill action is requested

- **GIVEN** a Skill has status `invalid`
- **WHEN** the primary action handler is invoked from the page
- **THEN** Web does not call the lifecycle callback.

#### Scenario: Valid Skill is displayed

- **GIVEN** a Skill is valid and actionable
- **WHEN** SkillHub is displayed
- **THEN** Web keeps the existing lifecycle action behavior.
