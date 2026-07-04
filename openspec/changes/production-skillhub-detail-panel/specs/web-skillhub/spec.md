# web-skillhub 规范变更

## ADDED Requirements

### Requirement: Web SHALL display a Skill detail panel

SkillHub MUST provide a detail panel that presents diagnostic information for a selected Skill.

#### Scenario: Detail panel defaults to a visible Skill

- **GIVEN** SkillHub has at least one visible Skill
- **WHEN** the page is displayed
- **THEN** Web displays a detail panel for one visible Skill.

#### Scenario: User selects a Skill for details

- **GIVEN** multiple Skill cards are visible
- **WHEN** the user opens details for one Skill
- **THEN** Web displays that Skill's version, source, permissions, entry, hash, tags, and install state.

#### Scenario: Selected Skill has rollback target

- **GIVEN** the selected Skill is installed
- **AND** it has a previous installed version
- **WHEN** the detail panel is displayed
- **THEN** Web displays the rollback target
- **AND** Web exposes a rollback action.

#### Scenario: Selected Skill has validation errors

- **GIVEN** the selected Skill is invalid
- **WHEN** the detail panel is displayed
- **THEN** Web displays its validation errors.
