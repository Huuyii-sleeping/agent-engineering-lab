# web-skillhub 规范变更

## ADDED Requirements

### Requirement: BFF SHALL audit failed Skill lifecycle operations

BFF MUST persist failed lifecycle operations when the request has a clear Skill id.

#### Scenario: Rollback target is missing

- **GIVEN** a Skill has no rollback target
- **WHEN** the user requests rollback
- **THEN** BFF returns the existing failure response
- **AND** BFF writes an audit event with `ok: false`.

### Requirement: Web SHALL display failed audit events

SkillHub MUST display failed audit events with their failure reason.

#### Scenario: Selected Skill has failed audit event

- **GIVEN** the selected Skill has a failed audit event
- **WHEN** the detail panel is displayed
- **THEN** Web displays the failed action and error message.
