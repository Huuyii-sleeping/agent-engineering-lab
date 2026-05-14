## ADDED Requirements

### Requirement: CLI MUST provide a local multi-line composer mode
CLI MUST 提供本地多行 composer 模式，让用户可以先草拟、预览，再把完整草稿一次性提交给模型。

#### Scenario: User enters composer mode
- **WHEN** 用户输入 `/compose`
- **THEN** 系统进入草稿模式
- **AND** 后续普通文本输入只追加到 draft

#### Scenario: User previews the current draft
- **WHEN** 用户输入 `/preview`
- **THEN** 系统展示当前 draft 内容、行数和摘要
- **AND** 不调用模型

#### Scenario: User sends the current draft
- **WHEN** 用户输入 `/send`
- **THEN** 系统把当前 draft 作为一次完整 prompt 发给模型
- **AND** draft 在发送后被清空

#### Scenario: User cancels the current draft
- **WHEN** 用户输入 `/cancel`
- **THEN** 系统丢弃当前 draft
- **AND** 退出草稿模式

### Requirement: Composer mode MUST be reflected in terminal interaction surfaces
Composer 模式 MUST 在 CLI / TUI 的 prompt、footer 或控制面中明确展示，避免用户误以为当前输入会直接发送。

#### Scenario: Prompt reflects composer state
- **WHEN** 用户已经进入 composer 模式
- **THEN** prompt 或 footer 显示 draft line count 或 composer active 状态

### Requirement: Composer mode MUST not trigger non-explicit local shortcuts
在 composer 模式中，普通文本输入 MUST 不触发审批快捷词等隐式本地动作，除非用户明确使用 slash command。

#### Scenario: Approval shortcut text inside draft
- **WHEN** 用户处于 composer 模式并输入 `approve`、`批准`、`yes`
- **THEN** 文本被追加到 draft
- **AND** 不执行审批动作
