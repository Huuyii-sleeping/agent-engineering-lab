## ADDED Requirements

### Requirement: Query runtime services MUST be composable as a dependency bundle
Query runtime 的横切 service 依赖 MUST 能作为稳定依赖包装配和传递，而不是长期依赖不断扩张的构造函数字段列表。

#### Scenario: QueryEngine 接收 runtime services 依赖包
- **WHEN** 维护者阅读 `QueryEngine` 构造与字段定义
- **THEN** 横切 service 依赖以 `RuntimeServices` 或等效依赖包表达，而不是以一组彼此独立的 service 字段散列

#### Scenario: 调用方按单项 service 覆盖测试依赖
- **WHEN** 测试或入口只需要替换某一个 service
- **THEN** app runtime 装配仍支持按单项 override 合并默认依赖包，而不要求调用方手动构造完整依赖集合

#### Scenario: ToolService 保持工具层实现归属
- **WHEN** runtime services 依赖包包含 tool service 引用
- **THEN** 这只表达 query runtime 的依赖需求，不要求 `ToolService` 文件迁移出 tools 层
