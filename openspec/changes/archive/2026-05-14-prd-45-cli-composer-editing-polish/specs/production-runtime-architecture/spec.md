## ADDED Requirements

### Requirement: Composer draft editing MUST preserve intentional blank lines and support local rollback
在 composer 模式中，CLI / TUI MUST 保留用户有意输入的空行，并提供本地草稿回退能力，避免长草稿只能追加不能修正。

#### Scenario: Blank line is preserved while drafting
- **WHEN** 用户已进入 composer 模式并提交一个空行
- **THEN** 系统把该空行追加到 draft
- **AND** 后续 `/preview` 或 `/send` 能看到该空行仍然存在

#### Scenario: User removes the latest draft lines
- **WHEN** 用户输入 `/pop` 或 `/pop 3`
- **THEN** 系统移除最近 1 行或 3 行 draft
- **AND** 返回最新 draft 的行数和字符数摘要

### Requirement: Composer surfaces MUST provide structured draft visibility
Composer 相关交互面 MUST 提供结构化 draft 可视能力，而不只是一个抽象“已进入草稿模式”的状态提示。

#### Scenario: Preview shows draft structure
- **WHEN** 用户输入 `/preview`
- **THEN** 输出展示 line count、char count 和有结构的 draft 内容

#### Scenario: TUI exposes a dedicated draft panel
- **WHEN** 用户在 TUI 中处于 composer 模式
- **THEN** 仪表盘展示独立 draft panel
- **AND** 该 panel 至少显示草稿摘要与最近若干行内容
