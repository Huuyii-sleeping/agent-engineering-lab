## ADDED Requirements

### Requirement: Harness SHALL provide a local scenario matrix runner

Agent CLI test harness SHALL provide a local scenario matrix runner that lists and executes registered production harness scenarios without real network calls. The runner MUST support running all scenarios and selecting scenarios by stable name.

#### Scenario: List registered harness scenarios
- **WHEN** the harness matrix is queried for available scenarios
- **THEN** it returns stable scenario names and descriptions for the registered production harness scenarios

#### Scenario: Run selected harness scenarios
- **WHEN** the harness matrix runner receives a list of scenario names
- **THEN** it executes only those scenarios through the production harness runner
- **AND** it reports any unknown scenario name as a failed matrix result

#### Scenario: Run all harness scenarios locally
- **WHEN** `pnpm --dir apps/agent-cli run test:harness` is executed
- **THEN** the local harness matrix scenarios run without real model or network access
- **AND** the command fails if any registered scenario fails

### Requirement: Harness SHALL summarize matrix results

Agent CLI test harness SHALL return structured matrix results and a readable text summary for local validation. The summary MUST include total, passed, failed counts, scenario names, and failing step details when available.

#### Scenario: Matrix summary for passing run
- **WHEN** all selected harness scenarios pass
- **THEN** the matrix result reports zero failures
- **AND** the text summary lists the passing scenarios

#### Scenario: Matrix summary for failing run
- **WHEN** one or more selected harness scenarios fail
- **THEN** the matrix result reports failed count greater than zero
- **AND** the text summary includes the failed scenario name and failed step message
