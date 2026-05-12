## ADDED Requirements

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
