# web-skillhub 规范变更

## MODIFIED Requirements

### Requirement: BFF SHALL write SkillHub packages to the shared runtime root

BFF MUST allow deployment to configure the local SkillHub package data root with `SKILLHUB_DATA_ROOT`.

#### Scenario: BFF uses shared SkillHub data root

- **GIVEN** `SKILLHUB_DATA_ROOT` is configured
- **WHEN** BFF starts
- **THEN** its SkillHub store uses that directory for downloaded and custom packages.
