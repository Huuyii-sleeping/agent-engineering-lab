## ADDED Requirements

### Requirement: Scheduled prompt notifications MUST only be consumed by scheduled rounds

Scheduled prompt notifications MUST NOT be drained by ordinary user query rounds. A query round MAY consume scheduled prompt notifications only when the caller explicitly marks it as a scheduled prompt consumption round.

#### Scenario: Ordinary user query runs after schedule creation
- **WHEN** 用户普通 query round 执行 query preparation
- **THEN** 系统不得 drain pending scheduled prompt notifications
- **AND** pending scheduled prompt MUST remain available for the proactive scheduler loop

#### Scenario: Proactive scheduler round runs
- **WHEN** scheduler loop detects due scheduled prompts
- **THEN** 系统 MUST run a scheduled consumption round with scheduled notifications enabled
- **AND** due scheduled prompt MAY be drained and injected into that scheduled round

#### Scenario: Daemon-backed scheduler round runs
- **WHEN** Ink CLI 连接 daemon-backed service 并检测到 due scheduled prompt
- **THEN** chat request MUST include an explicit scheduled notification consumption flag
- **AND** daemon service MUST pass that flag into the query runtime
