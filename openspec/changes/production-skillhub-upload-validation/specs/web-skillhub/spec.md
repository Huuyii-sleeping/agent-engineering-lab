# web-skillhub 规范变更

## ADDED Requirements

### Requirement: Web SHALL validate custom Skill package structure before upload

SkillHub MUST validate basic custom package structure before sending an upload request.

#### Scenario: Package JSON is not an object

- **GIVEN** the upload input parses to a non-object value
- **WHEN** the user submits the package
- **THEN** Web displays a package structure error
- **AND** Web does not call the upload callback.

#### Scenario: Package files are missing

- **GIVEN** the package does not include a non-empty `files` array
- **WHEN** the user submits the package
- **THEN** Web displays a package files error.

#### Scenario: Required files are missing

- **GIVEN** the package does not contain `SKILL.md` or `skill.json`
- **WHEN** the user submits the package
- **THEN** Web displays the missing required file error.

#### Scenario: Package is valid

- **GIVEN** the package contains valid file paths and content
- **WHEN** the user submits the package
- **THEN** Web allows the existing upload flow to continue.
