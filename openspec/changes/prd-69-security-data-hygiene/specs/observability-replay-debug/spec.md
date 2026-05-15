## ADDED Requirements

### Requirement: Observability payloads MUST redact sensitive content before persistence
observability 与 audit payload MUST 在落盘前统一执行隐藏字符清洗和 secret-like 内容脱敏，避免结构化事件日志直接保存敏感值。

#### Scenario: observability event 包含敏感字段
- **WHEN** 系统写入带有 token、password 或 api key 的 observability payload
- **THEN** `.observability/events.jsonl` 中保存脱敏后的字段值
- **AND** 原始敏感值不得直接进入事件日志

#### Scenario: observability payload 包含隐藏字符
- **WHEN** 系统写入包含 bidi 或隐藏控制字符的 observability payload
- **THEN** `.observability/events.jsonl` 中保存清理后的可见文本

#### Scenario: observability payload 包含 MCP 标识
- **WHEN** 系统写入与 MCP 工具相关的 observability payload
- **THEN** 事件日志与聚合指标不得直接暴露私有 MCP server 名称
