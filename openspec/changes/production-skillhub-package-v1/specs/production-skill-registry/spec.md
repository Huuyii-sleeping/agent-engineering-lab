# production-skill-registry 规范变更

## ADDED Requirements

### Requirement: Skill package v1 transport

Registry service MUST accept JSON skill packages with optional `skillPackageVersion`.

#### Scenario: Accept legacy package

- **GIVEN** a package omits `skillPackageVersion`
- **AND** it contains valid `SKILL.md` and `skill.json`
- **WHEN** the package is published or seeded
- **THEN** the package is accepted as a legacy package.

#### Scenario: Accept package v1

- **GIVEN** a package declares `skillPackageVersion: "1.0"`
- **AND** it contains valid `SKILL.md` and `skill.json`
- **WHEN** the package is published
- **THEN** the package is accepted and stored with its files intact.

#### Scenario: Reject unknown package version

- **GIVEN** a package declares an unsupported `skillPackageVersion`
- **WHEN** the package is published
- **THEN** the registry rejects it with a validation error.

### Requirement: Package file safety

Registry service MUST reject unsafe package file layouts.

#### Scenario: Reject duplicate path

- **GIVEN** a package contains two files with the same normalized path
- **WHEN** the package is published
- **THEN** the registry rejects it with a validation error.

#### Scenario: Reject invalid permissions declaration

- **GIVEN** a package contains `permissions.json`
- **AND** that file is not a JSON object with a string-array `permissions` field
- **WHEN** the package is published
- **THEN** the registry rejects it with a validation error.
