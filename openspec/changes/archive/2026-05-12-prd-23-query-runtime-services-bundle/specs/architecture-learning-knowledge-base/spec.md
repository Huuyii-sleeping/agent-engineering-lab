## ADDED Requirements

### Requirement: Runtime dependency shape changes MUST be documented
运行时依赖形态的调整 MUST 在学习沉淀文档中记录其边界收益、未采纳选项和后续动作。

#### Scenario: 引入 RuntimeServices 依赖包
- **WHEN** 仓库将 query runtime 的横切 service 依赖收成依赖包
- **THEN** 学习沉淀文档必须说明该依赖包解决了什么问题，以及为什么没有顺手重写工具协议层
