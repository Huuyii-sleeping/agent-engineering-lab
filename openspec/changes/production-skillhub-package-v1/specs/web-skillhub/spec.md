# web-skillhub 规范变更

## MODIFIED Requirements

### Requirement: Skill package upload compatibility

SkillHub upload MUST continue accepting legacy JSON packages and MUST also accept package v1 JSON packages through the existing upload entry.

#### Scenario: Upload package v1

- **GIVEN** a user submits a valid package with `skillPackageVersion: "1.0"`
- **WHEN** the upload is sent through BFF
- **THEN** SkillHub receives a successful skill response.

#### Scenario: Show package validation errors

- **GIVEN** a user submits a package with duplicate paths or invalid permissions declaration
- **WHEN** BFF rejects the package
- **THEN** SkillHub receives structured validation errors from the upload API.
