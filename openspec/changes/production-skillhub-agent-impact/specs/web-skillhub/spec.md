# web-skillhub 规范变更

## ADDED Requirements

### Requirement: Web SHALL display Agent usage impact for a Skill

SkillHub MUST show which Agent profiles currently bind the selected Skill.

#### Scenario: Agent binds selected Skill through versioned binding

- **GIVEN** an Agent profile has a `skills` binding for the selected Skill
- **WHEN** the Skill detail panel is displayed
- **THEN** Web displays that Agent in the usage impact section
- **AND** Web displays the bound Skill version when available.

#### Scenario: Agent binds selected Skill through legacy ids

- **GIVEN** an Agent profile has the selected Skill in `skillIds`
- **WHEN** the Skill detail panel is displayed
- **THEN** Web displays that Agent in the usage impact section.

#### Scenario: No Agent uses selected Skill

- **GIVEN** no Agent profile binds the selected Skill
- **WHEN** the Skill detail panel is displayed
- **THEN** Web displays that no Agent is currently using it.
