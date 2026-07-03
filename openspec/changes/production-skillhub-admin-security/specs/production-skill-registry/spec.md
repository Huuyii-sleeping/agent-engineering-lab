# production-skill-registry 规范变更

## ADDED Requirements

### Requirement: Admin token authentication

Registry service MUST protect all `/admin/**` endpoints with bearer token authentication.

#### Scenario: Missing admin token

- **GIVEN** a request to `/admin/publish`
- **AND** the request has no `Authorization` header
- **WHEN** registry handles the request
- **THEN** it responds with `401`.

#### Scenario: Invalid admin token

- **GIVEN** a request to `/admin/publish`
- **AND** the request has an invalid bearer token
- **WHEN** registry handles the request
- **THEN** it responds with `403`.

#### Scenario: Valid admin token

- **GIVEN** a request to `/admin/publish`
- **AND** the request has the configured bearer token
- **WHEN** registry handles the request
- **THEN** it may publish the package if validation succeeds.

### Requirement: Publisher administration

Registry service MUST support admin-managed publishers.

#### Scenario: Create publisher

- **GIVEN** an authenticated admin request with publisher id and name
- **WHEN** it calls `POST /admin/publishers`
- **THEN** registry stores the publisher and returns it.

#### Scenario: List publishers

- **GIVEN** an authenticated admin request
- **WHEN** it calls `GET /admin/publishers`
- **THEN** registry returns all publishers.

### Requirement: Admin audit events

Registry service MUST record admin mutations in an audit log.

#### Scenario: Publish audit event

- **GIVEN** an authenticated admin publish request succeeds
- **WHEN** the package is stored
- **THEN** registry writes a `skill.publish` audit event.
