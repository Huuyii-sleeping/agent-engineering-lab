## ADDED Requirements

### Requirement: File tools MUST enforce symlink-safe real path boundaries
文件工具 MUST 在执行前基于 `realpath` 或等效机制校验最终目标路径，拒绝通过 symlink、junction 或等效重定向实现的工作区逃逸。

#### Scenario: Symlink points outside the workspace
- **WHEN** 模型传入的工作区内路径经解析后实际落到工作区外
- **THEN** 系统拒绝该读写或编辑操作
- **AND** 返回明确的越界错误

### Requirement: File tools MUST support sensitive path policy and managed write mode
文件工具 MUST 支持敏感路径 denylist 与受管写入模式，避免本地写入默认对所有工作区路径等价开放。

#### Scenario: Write targets a denied sensitive path
- **WHEN** 写类工具尝试命中受保护的敏感路径策略
- **THEN** 系统阻止写入或要求更高等级审批

