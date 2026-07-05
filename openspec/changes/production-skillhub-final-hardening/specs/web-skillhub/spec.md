# web-skillhub 规范变更

## ADDED Requirements

### Requirement: Web SHALL provide production filters for SkillHub

SkillHub MUST allow filtering skills by lifecycle state, registry source, and maturity.

#### Scenario: Filter by lifecycle state

- **GIVEN** multiple skills with different lifecycle states
- **WHEN** the user selects a lifecycle state filter
- **THEN** Web limits the visible skill results to that state.

#### Scenario: Filter by registry source

- **GIVEN** multiple skills from different registry sources
- **WHEN** the user selects a source filter
- **THEN** Web limits the visible skill results to that source.

#### Scenario: Filter by maturity

- **GIVEN** stable and beta skills
- **WHEN** the user selects a maturity filter
- **THEN** Web limits the visible skill results to that maturity.

### Requirement: Web SHALL display SkillHub overview distributions

SkillHub MUST display source and lifecycle state distributions near the readiness summary.

#### Scenario: Overview is displayed

- **GIVEN** SkillHub has loaded skill items
- **WHEN** SkillHub is displayed
- **THEN** Web displays source counts
- **AND** Web displays lifecycle state counts.

### Requirement: Web SHALL display global recent SkillHub operations

SkillHub MUST display recent lifecycle audit events outside the selected skill detail panel.

#### Scenario: Audit events exist

- **GIVEN** recent Skill lifecycle events exist
- **WHEN** SkillHub is displayed
- **THEN** Web displays recent operations with action, skill, status, and time.

#### Scenario: Audit events are empty

- **GIVEN** no Skill lifecycle events exist
- **WHEN** SkillHub is displayed
- **THEN** Web displays an empty operations message.
