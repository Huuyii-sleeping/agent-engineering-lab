## ADDED Requirements

### Requirement: Architecture learning docs MUST be maintained by operation type only
架构学习沉淀 MUST 只按统一操作类型维护主文档，不再维护按 PRD 编号排列的学习流水账文档。

#### Scenario: 新增或修正架构学习沉淀
- **WHEN** 后续变更产生新的工程方法或修正已有理解
- **THEN** 维护者更新 `docs/learning/claude-code/operations/` 中对应操作类型文档，或在出现新操作类型时新增 operation 文档

#### Scenario: 阅读项目架构学习入口
- **WHEN** 维护者打开学习沉淀入口
- **THEN** README 只引导阅读 `operations/` 主线，而不是引导阅读 PRD 轮次流水账
