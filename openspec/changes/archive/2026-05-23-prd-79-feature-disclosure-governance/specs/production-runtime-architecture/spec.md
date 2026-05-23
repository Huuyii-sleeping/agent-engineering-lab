## ADDED Requirements

### Requirement: CLI and TUI MUST expose local feature disclosure governance

CLI / TUI 本地交互面 MUST 提供功能披露治理入口，列出公开本地功能、隐藏功能状态、实验或 reserved gap 状态，避免维护者只能从源码中推断是否存在隐藏命令、隐藏彩蛋或 beta-only surface。

#### Scenario: User inspects local feature disclosure
- **WHEN** 用户输入 `/features`
- **THEN** 系统展示本地 feature disclosure 清单
- **AND** 清单明确展示当前隐藏命令、隐藏彩蛋和 beta-only surface 的状态

#### Scenario: Feature disclosure is discoverable
- **WHEN** 用户查看 `/help`、`/help runtime` 或使用 `/palette feature`
- **THEN** 系统提供可发现的 `/features` 入口

#### Scenario: Hidden surfaces are not silently enabled
- **WHEN** 仓库没有实现隐藏命令、隐藏彩蛋或 beta-only header surface
- **THEN** `/features` MUST 明确报告这些能力为 `none registered` 或 `reserved_gap`
- **AND** 不得把未实现的隐藏能力伪装成可用功能
