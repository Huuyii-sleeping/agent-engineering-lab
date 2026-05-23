## MODIFIED Requirements

### Requirement: External text ingress MUST sanitize hidden control characters

系统 MUST 在外部文本进入本地 runtime 前清理 hidden control、bidi control 与常见 zero-width format characters，避免不可见字符直接进入工具目录、会话结果、memory 或落盘事件。

#### Scenario: MCP description 包含隐藏控制字符
- **WHEN** 外部 MCP server 返回带有 bidi、hidden control 或 zero-width format characters 的 tool description
- **THEN** 本地注册的工具描述使用清理后的可见文本

#### Scenario: MCP output 包含隐藏控制字符
- **WHEN** 外部 MCP tool 返回带有 bidi、hidden control 或 zero-width format characters 的 text 或 structured content
- **THEN** 归一化后的工具输出使用清理后的内容进入本地 runtime

#### Scenario: 嵌套外部文本包含零宽格式字符
- **WHEN** 外部文本 payload 的对象或数组字段包含 `U+200B`、`U+200C`、`U+200D`、`U+2060` 或 `U+FEFF`
- **THEN** 递归清理后的 payload 不包含这些零宽格式字符
- **AND** secret-like 内容仍按既有规则脱敏
