# agent-cli-test-harness Specification

## Purpose
TBD - created by archiving change prd-91-agent-cli-harness-foundation. Update Purpose after archive.
## Requirements
### Requirement: Harness MUST provide isolated workspace fixtures
Agent CLI 测试 harness MUST 提供隔离 workspace fixture，用于创建临时目录、写入初始文件、切换 `cwd`、设置环境变量，并在结束后恢复进程状态和清理临时目录。

#### Scenario: 场景执行后恢复进程状态
- **WHEN** 测试通过 harness 在临时 workspace 中执行场景
- **THEN** harness 在结束后恢复原始 `cwd` 与环境变量

### Requirement: Harness MUST provide deterministic model scripts
Agent CLI 测试 harness MUST 提供确定性模型脚本能力，使测试可以按序模拟 assistant 文本、tool call 响应和模型错误，而不依赖真实模型服务。

#### Scenario: 模型脚本按序消费
- **WHEN** 场景连续请求 deterministic model
- **THEN** harness 按脚本顺序返回响应，并记录每次请求

#### Scenario: 模型脚本耗尽
- **WHEN** 测试请求超过脚本中定义的响应数量
- **THEN** harness 返回明确错误，指出 deterministic model script exhausted

### Requirement: Harness MUST run structured local scenarios
Agent CLI 测试 harness MUST 支持结构化本地场景 runner，用统一步骤表达文件准备、动作执行、模型调用、故障注入和断言结果。

#### Scenario: 结构化场景执行成功
- **WHEN** 场景包含文件断言、输出断言和模型调用断言
- **THEN** harness 返回 passed 结果和每个步骤的可读记录

#### Scenario: 结构化场景执行失败
- **WHEN** 场景中的断言失败或动作抛错
- **THEN** harness 返回 failed 结果、失败步骤名称和失败原因

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

