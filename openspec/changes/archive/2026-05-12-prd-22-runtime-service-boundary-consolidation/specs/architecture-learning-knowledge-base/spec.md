## ADDED Requirements

### Requirement: Boundary correction phases MUST persist gap analysis and adoption status
每一轮生产级架构边界校正 MUST 在学习沉淀文档中记录外部源码启发、当前仓库差距、本轮采纳内容、暂不采纳内容和下一步动作。

#### Scenario: 完成 runtime service 边界校正
- **WHEN** 仓库完成一轮 runtime service 目录或依赖边界调整
- **THEN** `docs/learning/claude-code/` 中会新增或更新对应中文学习沉淀文档，说明本轮为什么这样收口

#### Scenario: 暂不迁移某个边界
- **WHEN** 设计中决定暂不迁移某个 service、目录或兼容入口
- **THEN** 学习沉淀文档必须记录暂不采纳原因，避免后续误判为遗漏
