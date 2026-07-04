# web-skillhub 规范变更

## ADDED Requirements

### Requirement: Web SHALL display Skill audit events

SkillHub MUST display recent successful lifecycle events for the selected Skill.

#### Scenario: Selected Skill has audit events

- **GIVEN** the selected Skill has audit events
- **WHEN** the detail panel is displayed
- **THEN** Web displays the event action, version, status, and timestamp.

#### Scenario: Selected Skill has no audit events

- **GIVEN** the selected Skill has no audit events
- **WHEN** the detail panel is displayed
- **THEN** Web displays that no audit events exist.

### Requirement: BFF SHALL persist Skill lifecycle audit events

BFF MUST append an audit event after successful Skill lifecycle operations.

#### Scenario: Skill lifecycle operation succeeds

- **GIVEN** a Skill download, upload, install, update, rollback, or uninstall succeeds
- **WHEN** BFF returns success
- **THEN** BFF persists an audit event for that Skill.
