# web-skillhub 规范变更

## MODIFIED Requirements

### Requirement: Private upload through BFF

SkillHub private upload MUST continue working through BFF when registry service admin token is configured.

#### Scenario: BFF forwards admin token

- **GIVEN** BFF is configured with `SKILL_REGISTRY_SERVICE_URL` and `SKILL_REGISTRY_ADMIN_TOKEN`
- **WHEN** a user uploads a custom skill package through SkillHub
- **THEN** BFF publishes it to registry service with bearer token authorization.
