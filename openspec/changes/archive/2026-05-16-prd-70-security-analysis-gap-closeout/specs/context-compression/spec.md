## ADDED Requirements

### Requirement: Transcript snapshots MUST be redacted and lifecycle-managed
`compact` 产生的 transcript snapshot MUST 在写入 `.transcripts/` 前执行高敏感内容脱敏，并接入统一生命周期治理，而不是将压缩前后上下文永久原样落盘。

#### Scenario: Compact snapshot contains sensitive conversation content
- **WHEN** 压缩前或压缩后的 transcript 中包含 secret-like 内容或高敏感上下文
- **THEN** 系统写入的 snapshot 不直接保留原始敏感值
- **AND** snapshot 带有可供后续清理的生命周期信息

### Requirement: Transcript access surfaces MUST not bypass snapshot protections
任何 transcript 浏览、导出或读取入口 MUST 不得绕过 transcript snapshot 的脱敏与生命周期约束。

#### Scenario: Client reads a retained transcript snapshot
- **WHEN** CLI、TUI、MCP 或其他本地入口读取 transcript snapshot
- **THEN** 返回内容遵守同一套脱敏与可见性边界

