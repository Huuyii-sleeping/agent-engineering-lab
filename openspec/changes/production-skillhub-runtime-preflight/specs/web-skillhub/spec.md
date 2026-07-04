# web-skillhub 规范变更

## ADDED Requirements

### Requirement: BFF SHALL proxy Skill binding preflight

BFF MUST expose a local API for checking Agent Skill binding runtime readiness through Agent service.

#### Scenario: Proxy Agent Skill preflight

- **GIVEN** Web or another local client posts an Agent context to BFF
- **WHEN** it calls `/api/agent-skills/resolve`
- **THEN** BFF forwards the request to Agent service `/skills/resolve`
- **AND** returns the upstream status and body.
