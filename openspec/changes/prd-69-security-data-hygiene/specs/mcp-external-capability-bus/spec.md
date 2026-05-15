## ADDED Requirements

### Requirement: MCP metadata and outputs MUST be sanitized before exposure
外部 MCP server 的工具描述和工具输出 MUST 在进入本地 runtime 前完成隐藏字符清洗与 secret-like 内容脱敏。

#### Scenario: 外部工具描述包含隐藏字符
- **WHEN** MCP server 的 `tools/list` 返回带有 bidi、隐藏控制字符或敏感片段的 description
- **THEN** 本地工具注册暴露清洗后的 description

#### Scenario: 外部工具输出包含敏感片段
- **WHEN** MCP tool 返回 text content 或 structured content，且其中包含 secret-like 字符串
- **THEN** 本地归一化输出返回脱敏后的结果
- **AND** 原始敏感值不得直接进入会话工具结果文本
