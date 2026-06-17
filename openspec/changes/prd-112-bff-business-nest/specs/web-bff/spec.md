## MODIFIED Requirements

### Requirement: Web BFF MUST expose stable Web API routes
Web BFF MUST keep existing `/api/*` routes compatible while migrating implementation internals.

#### Scenario: Existing chat API remains available
- **WHEN** Web Console calls session, health, message, audit, security, or event stream endpoints
- **THEN** BFF returns the same response shape as before migration

#### Scenario: Chat stream remains streamed
- **WHEN** Web Console sends a streaming chat message
- **THEN** BFF forwards upstream SSE chunks without buffering the full response first

## ADDED Requirements

### Requirement: Web BFF MUST manage local profile business state
Web BFF MUST provide APIs for reading and updating the local Web Console profile.

#### Scenario: User reads profile
- **WHEN** Web Console calls `GET /api/profile`
- **THEN** BFF returns a normalized profile with `displayName` and `description`

#### Scenario: User updates profile
- **WHEN** Web Console calls `PUT /api/profile` with valid profile fields
- **THEN** BFF persists the profile locally
- **AND** subsequent reads return the updated profile

### Requirement: Web BFF MUST manage local settings business state
Web BFF MUST provide APIs for reading and partially updating Web Console settings.

#### Scenario: User reads settings
- **WHEN** Web Console calls `GET /api/settings`
- **THEN** BFF returns normalized settings including theme, language, shortcut hints, and markdown rendering state

#### Scenario: User patches settings
- **WHEN** Web Console calls `PATCH /api/settings` with supported fields
- **THEN** BFF persists the changed fields locally
- **AND** preserves unspecified fields
