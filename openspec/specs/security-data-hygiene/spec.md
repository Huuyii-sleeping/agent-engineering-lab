# security-data-hygiene Specification

## Purpose
定义安全数据卫生基线，统一约束审批与审计落盘中的敏感信息脱敏、隐藏字符清洗，以及稳定 scope fingerprint 的生成与消费。

## Requirements
### Requirement: Security sinks MUST persist redacted scope previews
系统 MUST 在 approval 与 security audit 落盘前先脱敏 secret-like 参数，并使用稳定 scope fingerprint 做匹配，不得依赖原始参数快照作为唯一匹配键。

#### Scenario: 创建带敏感参数的 approval request
- **WHEN** 调用方为包含 token、password 或 api key 的工具参数创建 approval request
- **THEN** `.security/approvals.json` 中保存 redacted scope preview
- **AND** 原始敏感值不得直接写入 approval 持久化文件
- **AND** 系统保存可用于后续消费匹配的稳定 scope fingerprint

#### Scenario: 消费 approval 时不依赖原始 scope 明文
- **WHEN** 已批准的工具调用再次以同一参数执行
- **THEN** 系统优先通过稳定 scope fingerprint 完成 approval 消费
- **AND** 不要求把原始敏感参数明文重新保存到 approval 记录中

### Requirement: External text ingress MUST sanitize hidden control characters
系统 MUST 在外部文本进入本地 runtime 前清理 hidden control / bidi 字符，避免不可见字符直接进入工具目录、会话结果或落盘事件。

#### Scenario: MCP description 包含隐藏控制字符
- **WHEN** 外部 MCP server 返回带有 bidi 或隐藏控制字符的 tool description
- **THEN** 本地注册的工具描述使用清理后的可见文本

#### Scenario: MCP output 包含隐藏控制字符
- **WHEN** 外部 MCP tool 返回带有 bidi 或隐藏控制字符的 text 或 structured content
- **THEN** 归一化后的工具输出使用清理后的内容进入本地 runtime
