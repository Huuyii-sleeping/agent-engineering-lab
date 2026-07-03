# agent-skill-binding 规范变更

## MODIFIED Requirements

### Requirement: Installed skill compatibility

Agent skill binding MUST continue working for skills installed from legacy packages and package v1 packages.

#### Scenario: Install package v1 skill

- **GIVEN** a valid package v1 skill has been uploaded or downloaded
- **WHEN** the user installs it
- **THEN** the installed skill can be selected by Agent configuration using the existing installed skill source.
