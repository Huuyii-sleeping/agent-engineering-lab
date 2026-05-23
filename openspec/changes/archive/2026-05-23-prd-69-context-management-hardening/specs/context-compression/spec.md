# context-compression Delta

## MODIFIED Requirements

### Requirement: Agent MUST support automatic compaction with snapshot

系统 MUST 在估算 token 超过有效压缩阈值时自动压缩，并在压缩前后落盘脱敏 snapshot。

#### Scenario: 自动压缩触发

- **WHEN** 估算 token 超过有效压缩阈值
- **THEN** 下一次模型请求前自动执行压缩
- **AND** 压缩摘要不原样复灌全部旧消息

#### Scenario: 快照落盘

- **WHEN** 执行任意压缩
- **THEN** 在 `.transcripts/` 写入压缩前后脱敏会话快照和生命周期元数据
