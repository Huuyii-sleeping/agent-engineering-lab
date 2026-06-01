## ADDED Requirements

### Requirement: Harness SHALL include service-level session resume golden scenarios

Agent CLI test harness SHALL include fast local golden scenarios for service-level session resume. These scenarios MUST run without real model or network calls and MUST be registered in the local scenario matrix.

#### Scenario: Matrix runs session resume scenario

- **WHEN** `pnpm --dir apps/agent-cli run test:harness` is executed
- **THEN** the harness matrix runs a stable session/resume scenario through deterministic local fixtures
- **AND** the command fails if session id continuity, history continuity, runtime state continuity, journal append-only behavior, or session isolation assertions fail

#### Scenario: Selected session resume scenario can run locally

- **WHEN** the matrix runner receives the stable session/resume scenario name
- **THEN** it executes only that scenario without using real network services
- **AND** it reports readable failed step details when any resume assertion fails
