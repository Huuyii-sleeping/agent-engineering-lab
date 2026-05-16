# context-compression Specification

## Purpose
定义 Agent 的上下文压缩能力，包括 token 估算、手动压缩和超阈值时的自动压缩与快照落盘。
## Requirements
### Requirement: Agent SHALL provide manual context compaction tools
系统 SHALL 提供 `estimate_tokens` 与 `compact` 工具，支持会话 token 估算与手动压缩。

#### Scenario: 估算 token
- **WHEN** 模型调用 `estimate_tokens`
- **THEN** 返回基于字符数/4 的近似 token 估算值

#### Scenario: 手动压缩
- **WHEN** 模型调用 `compact`
- **THEN** 系统压缩历史消息并返回压缩结果摘要

### Requirement: Agent MUST support automatic compaction with snapshot
系统 MUST 在估算 token 超过阈值时自动压缩，并在压缩前落盘完整会话快照。

#### Scenario: 自动压缩触发
- **WHEN** 估算 token 超过 50000
- **THEN** 下一次模型请求前自动执行压缩

#### Scenario: 快照落盘
- **WHEN** 执行任意压缩（手动或自动）
- **THEN** 在 `.transcripts/transcript_<ts>.jsonl` 写入压缩前会话内容

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

