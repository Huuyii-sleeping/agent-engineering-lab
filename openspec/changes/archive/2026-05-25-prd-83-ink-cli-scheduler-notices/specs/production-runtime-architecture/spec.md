## ADDED Requirements

### Requirement: Ink TSX CLI surface MUST proactively process scheduled prompts

Ink/TSX CLI surface MUST 在 interactive TTY 模式下主动轮询 scheduler，并在 scheduled prompt 到期时将 due notice 和 assistant 回复追加到当前消息流。

#### Scenario: Embedded runtime scheduled prompt becomes due
- **WHEN** Ink/TSX CLI 使用 embedded runtime
- **AND** scheduler 中存在 due scheduled prompt
- **THEN** 系统通过现有 scheduled round 处理该 prompt
- **AND** 当前 Ink 消息流展示 scheduled due 和 assistant 回复

#### Scenario: Daemon-backed scheduled prompt becomes due
- **WHEN** Ink/TSX CLI 连接 daemon-backed service
- **AND** scheduler 中存在 due scheduled prompt
- **THEN** 系统 tick scheduler 并通过 daemon-backed `chat()` 处理 due prompt
- **AND** 当前 Ink 消息流展示 scheduled due 和 assistant 回复

#### Scenario: Non-interactive smoke rendering
- **WHEN** Ink/TSX CLI 运行在非 TTY 管道输入模式
- **THEN** 系统不得启动后台 scheduled interval
