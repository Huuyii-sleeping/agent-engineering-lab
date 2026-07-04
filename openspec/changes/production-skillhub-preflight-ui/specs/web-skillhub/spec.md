# web-skillhub 规范变更

## ADDED Requirements

### Requirement: Web SHALL display Agent Skill runtime preflight status

Web Agent configuration MUST allow users to check whether the current Agent skill bindings can be loaded by the runtime.

#### Scenario: Preflight succeeds

- **GIVEN** an Agent draft has version-bound Skill bindings
- **WHEN** the user runs the runtime check
- **THEN** Web displays that the runtime can load the bindings
- **AND** displays how many Skills resolved.

#### Scenario: Preflight fails

- **GIVEN** an Agent draft has a missing or invalid Skill binding
- **WHEN** the user runs the runtime check
- **THEN** Web displays the runtime failure reason.

#### Scenario: Draft changes after preflight

- **GIVEN** a preflight result is visible
- **WHEN** the Agent draft changes
- **THEN** Web clears the stale preflight result.
