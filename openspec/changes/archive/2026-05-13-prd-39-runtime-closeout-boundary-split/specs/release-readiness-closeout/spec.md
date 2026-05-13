## ADDED Requirements

### Requirement: Runtime closeout MUST leave active changes archived and validation evidence documented
Runtime 总收口完成后 MUST 归档 OpenSpec change、清空 active changes，并在交接文档中记录 focused tests、build、OpenSpec strict 与 diff check 验证结果。

#### Scenario: 完成 runtime closeout
- **WHEN** PRD-39 实现完成并归档
- **THEN** `openspec list --json` 返回无活动 change，交接文档记录本轮验证命令与本地 commit 状态
