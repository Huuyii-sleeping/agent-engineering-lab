## ADDED Requirements

### Requirement: Final release closeout MUST verify release gate documentation and active change state
最终发布收口 MUST 执行统一发布检查，确认文档入口与当前仓库状态一致，归档本轮 OpenSpec change，并记录验证证据。

#### Scenario: 统一发布检查通过
- **WHEN** 维护者执行最终 release closeout
- **THEN** 系统运行根目录 `pnpm release:check` 并记录结果

#### Scenario: 文档入口一致
- **WHEN** 维护者阅读根 README、PRD 路线图或交接文档
- **THEN** 文档指向当前有效的 `operations/` 学习沉淀入口和 release check 命令，而不是已删除的 PRD 学习流水账

#### Scenario: OpenSpec 状态收口
- **WHEN** 最终 release closeout 完成
- **THEN** OpenSpec active changes 为空，`openspec validate --all --strict` 通过，且本轮 change 已归档
