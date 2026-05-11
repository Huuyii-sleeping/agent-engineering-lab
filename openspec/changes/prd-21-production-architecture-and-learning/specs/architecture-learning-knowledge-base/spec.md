## ADDED Requirements

### Requirement: Repository SHALL persist architecture learning notes as first-class project assets
仓库 MUST 将外部源码分析、本地源码映射和采纳结论沉淀为正式学习文档，而不是只保留在对话或临时说明中。

#### Scenario: 新增架构参考材料
- **WHEN** 团队引入新的外部架构参考源码、分析文章或本地基线材料
- **THEN** 仓库中会新增或更新对应学习文档，记录来源、提炼结论、映射关系与采纳状态

#### Scenario: 维护者回看历史决策
- **WHEN** 维护者阅读学习沉淀文档
- **THEN** 能直接看到“看到了什么、当前仓库差距是什么、采纳了什么、未采纳什么及原因”

### Requirement: Production architecture phases MUST update learning docs together with implementation planning
每一轮生产级架构重构阶段 MUST 与学习沉淀文档联动更新，保证规划、实现和学习资产保持同步。

#### Scenario: 创建新的架构重构 change
- **WHEN** 仓库创建新的生产级架构重构 change
- **THEN** 该 change 的 proposal / design / tasks 会引用或要求更新对应学习文档

#### Scenario: 完成一轮架构实现
- **WHEN** 一轮架构实现完成
- **THEN** 学习文档同步补充本轮采纳结果与仍待解决的结构问题，而不是停留在初始阅读笔记
