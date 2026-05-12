# architecture-learning-knowledge-base Specification

## Purpose
定义架构学习沉淀的仓库级知识资产边界，要求外部源码分析、本地实现映射、采纳结论和后续问题随生产级重构阶段同步更新。
## Requirements
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

### Requirement: Boundary correction phases MUST persist gap analysis and adoption status
每一轮生产级架构边界校正 MUST 在学习沉淀文档中记录外部源码启发、当前仓库差距、本轮采纳内容、暂不采纳内容和下一步动作。

#### Scenario: 完成 runtime service 边界校正
- **WHEN** 仓库完成一轮 runtime service 目录或依赖边界调整
- **THEN** `docs/learning/claude-code/` 中会新增或更新对应中文学习沉淀文档，说明本轮为什么这样收口

#### Scenario: 暂不迁移某个边界
- **WHEN** 设计中决定暂不迁移某个 service、目录或兼容入口
- **THEN** 学习沉淀文档必须记录暂不采纳原因，避免后续误判为遗漏

### Requirement: Runtime dependency shape changes MUST be documented
运行时依赖形态的调整 MUST 在学习沉淀文档中记录其边界收益、未采纳选项和后续动作。

#### Scenario: 引入 RuntimeServices 依赖包
- **WHEN** 仓库将 query runtime 的横切 service 依赖收成依赖包
- **THEN** 学习沉淀文档必须说明该依赖包解决了什么问题，以及为什么没有顺手重写工具协议层

