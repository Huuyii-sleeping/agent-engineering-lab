# production-runtime-architecture Specification

## Purpose
定义生产级 Agent 运行时的目标分层与共享装配边界，约束 CLI、HTTP service 和未来 Web 入口复用同一套 query、tool 与 service runtime。
## Requirements
### Requirement: Repository SHALL define an explicit production runtime layering
仓库 MUST 为生产级 Agent 明确定义稳定分层，至少覆盖 entrypoints、bootstrap / composition root、runtime / query、tools / permissions、services / state 这些职责边界，而不是继续主要依赖隐式约定和大文件聚合。

#### Scenario: 新入口接入共享运行时
- **WHEN** 系统新增一个 CLI、HTTP 或 Web 入口
- **THEN** 该入口通过共享 bootstrap / composition root 装配依赖，并调用同一套 runtime 能力，而不是重新拼装独立业务流

#### Scenario: 运行时逻辑从入口层独立
- **WHEN** 维护者阅读入口文件
- **THEN** 能明确区分参数解析、环境初始化、依赖装配与核心 query / tool runtime，而不是把它们混在单个入口实现中

### Requirement: Query runtime SHALL be reusable across interaction surfaces
Query / conversation runtime MUST 作为可复用核心存在，能够被 CLI、HTTP service 与未来 Web 展示层共享，而不是绑定在单一交互表面中。

#### Scenario: 不同交互表面复用同一 query runtime
- **WHEN** CLI 和 HTTP service 分别发起一轮 Agent 执行
- **THEN** 两者通过同一 query runtime 契约启动执行，只在输入输出适配层存在差异

#### Scenario: 运行时状态独立而装配共享
- **WHEN** 两个不同表面各自创建会话
- **THEN** 它们共享应用装配与服务定义，但保有独立的会话历史与执行状态

### Requirement: Tool runtime MUST expose stable contracts and execution context
工具运行时 MUST 形成稳定契约，至少明确工具注册、工具匹配、执行上下文、权限门禁与观测链路的职责归属，支持 native、subagent 与 MCP 工具统一接入。

#### Scenario: 工具来源不同但执行契约一致
- **WHEN** 系统执行 native、subagent 或 MCP 工具
- **THEN** 它们都通过统一的工具执行契约进入路由、权限、观测与结果回填链路

#### Scenario: 新增工具能力时不修改入口主流程
- **WHEN** 系统新增一种工具实现或工具来源
- **THEN** 维护者主要修改工具注册与执行边界，而不是重写 CLI、HTTP 或主循环入口装配逻辑

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

### Requirement: Tool service internals MUST separate catalog and execution boundaries
工具服务内部 MUST 区分工具目录能力与工具执行能力，使工具来源、metadata/schema 暴露和执行分发可以独立演进。

#### Scenario: 读取工具服务实现
- **WHEN** 维护者阅读 `tools/service.ts`
- **THEN** 该文件主要组合工具 catalog 与 executor，而不是直接承载工具列表、metadata 转换和执行分发的全部细节

#### Scenario: 新增工具来源
- **WHEN** 系统新增一种工具来源或 metadata 暴露规则
- **THEN** 维护者主要修改工具 catalog 边界，而不是修改 query runtime 或工具执行分发逻辑

#### Scenario: 调整工具执行分发
- **WHEN** 系统调整 builtin、subagent 或 MCP 工具执行路由
- **THEN** 维护者主要修改工具 executor 边界，而不是修改工具 catalog 或 query runtime

### Requirement: Tool executor internals MUST separate dispatch and target execution boundaries
工具 executor 内部 MUST 区分 target dispatch、builtin/subagent execution 与 MCP execution，使不同工具目标的执行策略可以独立演进。

#### Scenario: 读取工具 executor 实现
- **WHEN** 维护者阅读 `tools/executor.ts`
- **THEN** 该文件主要根据工具 target 分发到专门 executor，而不是直接承载 builtin handler 解析和 MCP runner 调用的全部细节

#### Scenario: 调整 builtin 或 subagent 工具执行
- **WHEN** 系统调整 builtin 或 subagent 工具 handler 解析、preview 或 replay metadata 传递
- **THEN** 维护者主要修改 builtin executor 边界，而不是修改 MCP execution 或 query runtime

#### Scenario: 调整 MCP 工具执行
- **WHEN** 系统调整 MCP 工具调用、fallback 或 protected execution 包装
- **THEN** 维护者主要修改 MCP executor 边界，而不是修改 builtin execution 或 query runtime

