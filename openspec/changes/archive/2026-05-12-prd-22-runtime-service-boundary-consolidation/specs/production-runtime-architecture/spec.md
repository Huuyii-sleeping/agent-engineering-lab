## ADDED Requirements

### Requirement: Runtime services MUST expose a stable application service boundary
应用级 runtime service MUST 通过稳定目录与聚合导出边界暴露给 bootstrap、query engine 与交互入口，而不是继续散落在入口同级根目录中。

#### Scenario: 核心装配引用 service 聚合边界
- **WHEN** 维护者阅读 `bootstrap/app-runtime.ts` 或 `runtime/query-engine.ts`
- **THEN** 这些核心装配路径通过统一 service 边界引用应用级 runtime service，而不是分别引用多个根目录 `*-service` 文件

#### Scenario: 新增应用级 runtime service
- **WHEN** 后续新增一个供 query runtime 或多个入口共享的应用级 service
- **THEN** 该 service 应进入统一 service 边界并通过聚合导出暴露，而不是直接新增到 `src/` 根目录

#### Scenario: 工具协议层 service 保持所属层边界
- **WHEN** 某个 service 主要属于工具协议、注册或执行子系统内部
- **THEN** 该 service 可以保留在 `tools/` 等所属层目录中，并由设计文档说明不迁移原因
