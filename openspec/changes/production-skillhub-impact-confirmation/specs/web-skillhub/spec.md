# web-skillhub 规范变更

## ADDED Requirements

### Requirement: Web SHALL confirm Skill operations that affect bound Agents

SkillHub MUST require confirmation before executing a Skill operation that can affect Agent profiles currently binding that Skill.

#### Scenario: Upgrade affects Agent

- **GIVEN** a Skill is bound by one or more Agent profiles
- **AND** the Skill has an update available
- **WHEN** the user triggers upgrade
- **THEN** Web displays a confirmation panel listing affected Agents
- **AND** Web does not call the upgrade action until the user confirms.

#### Scenario: Rollback affects Agent

- **GIVEN** a Skill is bound by one or more Agent profiles
- **AND** the Skill has a rollback target
- **WHEN** the user triggers rollback
- **THEN** Web displays a confirmation panel listing affected Agents.

#### Scenario: Operation has no Agent impact

- **GIVEN** no Agent profile binds the Skill
- **WHEN** the user triggers download, install, upgrade, uninstall, or rollback
- **THEN** Web executes the action without an impact confirmation.
