# web-skillhub 规范变更

## ADDED Requirements

### Requirement: BFF SHALL reject concurrent Skill lifecycle operations

BFF MUST reject lifecycle operations while another lifecycle operation is running.

#### Scenario: Lifecycle operation is busy

- **GIVEN** a Skill lifecycle operation is running
- **WHEN** another lifecycle operation is requested
- **THEN** BFF returns a busy error.

### Requirement: BFF SHALL expose SkillHub readiness

BFF MUST expose a readiness summary for SkillHub production operation.

#### Scenario: SkillHub is ready

- **GIVEN** registry and local store checks pass
- **WHEN** readiness is requested
- **THEN** BFF returns ready status and operational counts.

#### Scenario: SkillHub is degraded

- **GIVEN** registry sync has a last error or invalid/failed counts exist
- **WHEN** readiness is requested
- **THEN** BFF returns degraded status.

### Requirement: Web SHALL display server SkillHub readiness when available

Web MUST use BFF readiness summary when loaded.

#### Scenario: Server readiness is loaded

- **GIVEN** BFF readiness is loaded
- **WHEN** SkillHub is displayed
- **THEN** Web displays server readiness label and counts.
