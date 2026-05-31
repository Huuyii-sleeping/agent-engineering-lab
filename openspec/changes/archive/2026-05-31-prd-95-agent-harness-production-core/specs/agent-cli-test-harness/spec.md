## ADDED Requirements

### Requirement: Harness SHALL drive the production query engine

Agent CLI test harness SHALL provide a local scenario runner that executes the production `QueryEngine` with deterministic model responses and fake runtime services. The runner MUST use the same query preparation, model request, tool execution, finalization, and stop-stage code paths used by production runtime.

#### Scenario: assistant-only agent round
- **WHEN** a harness scenario provides a deterministic assistant text response without tool calls
- **THEN** the production query engine appends the assistant message
- **AND** the scenario result exposes the final messages and stop reason for assertions

#### Scenario: tool-driven agent round
- **WHEN** a harness scenario provides deterministic tool calls
- **THEN** the production query engine executes the tool stage
- **AND** the scenario result exposes assistant messages, tool result messages, runtime state, and tool execution records

### Requirement: Harness SHALL provide an OpenAI-compatible deterministic client

Agent CLI test harness SHALL provide a deterministic client adapter compatible with the subset of `client.chat.completions.create()` consumed by the runtime. The adapter MUST support scripted assistant messages, scripted tool calls, model errors, and exhausted-script failures without network access.

#### Scenario: scripted tool call response
- **WHEN** the production query model requests a completion from the harness deterministic client
- **THEN** the client returns a response containing the scripted assistant content and tool call payloads
- **AND** the harness records the request metadata for later assertions

#### Scenario: scripted model failure
- **WHEN** the next deterministic model script item is an error
- **THEN** the client rejects with that error
- **AND** the harness scenario can assert the resulting runtime stop state

### Requirement: Harness SHALL provide controllable runtime service fixtures

Agent CLI test harness SHALL provide fake runtime services for tools, hooks, memory, notifications, observability, delivery, model policy, and runtime coordination. These fixtures MUST record their calls and MUST allow scenarios to inject success, failure, blocked, and notification states without using external services.

#### Scenario: hook blocks session start
- **WHEN** a scenario configures the hook fixture to block `SessionStart`
- **THEN** the production query engine returns a blocked assistant message
- **AND** the harness result records the blocked hook state

#### Scenario: scheduled notification injection
- **WHEN** a scenario configures the notification fixture with pending scheduled prompt notifications
- **THEN** query preparation injects the scheduled prompt dynamic system message
- **AND** the harness result exposes the observability events recorded for the notification

### Requirement: Harness SHALL assert tool ordering, side effects, and observability

Agent CLI test harness SHALL provide structured assertions for assistant output, tool result order, filesystem side effects, runtime state, trace events, metrics, and blocked/approval results. Assertions MUST return readable failed step names and messages.

#### Scenario: readonly tool results preserve order
- **WHEN** a scenario contains multiple readonly parallel-safe tool calls
- **THEN** the harness can assert that tool result messages were appended in original tool call order

#### Scenario: write-capable tools remain serial
- **WHEN** a scenario contains write-capable tool calls
- **THEN** the harness can assert that the tool fixture observed serial execution

#### Scenario: trace event assertion failure
- **WHEN** a scenario expects a trace event that was not recorded
- **THEN** the harness returns a failed scenario result with the failing assertion step name

### Requirement: Harness SHALL include production golden scenarios

Agent CLI test harness SHALL include a fast local golden scenario suite for the core production agent loop. The suite MUST run without real network calls and MUST cover file tool flow, readonly parallel tool ordering, write serial behavior, hook blocking, model failure, and scheduled notification injection.

#### Scenario: golden suite runs in unit tests
- **WHEN** `pnpm --dir apps/agent-cli test` is executed
- **THEN** the production harness golden scenarios run as part of the unit test suite
- **AND** they do not leave workspace, memory, observability, or scheduler artifacts behind
