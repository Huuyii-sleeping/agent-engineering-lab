## ADDED Requirements

### Requirement: 系统 SHALL 使用单一共享 Mastra Instance
最终 Agent Service SHALL 在单个进程级 Mastra Instance 中注册 Agent、Workflow、Tool、Memory、storage、logger 和 observability。四个 Mastra adapters SHALL 复用该实例或其共享基础设施，不得各自创建不一致的运行内核和数据源。

#### Scenario: Agent 与 Workflow 共享基础设施
- **WHEN** AgentRuntimePort 和 WorkflowRuntimePort 同时执行请求
- **THEN** 两者使用同一 Mastra runtime 配置、storage、logger 和 observability

#### Scenario: Workflow 调用 Agent
- **WHEN** Workflow 的 LLM/Agent step 引用已注册 Agent
- **THEN** Workflow Adapter 从共享 Mastra Instance 获取 Agent
- **AND** 不创建绕过统一配置的独立模型客户端

### Requirement: MastraAgentRuntimeAdapter SHALL 翻译 Agent 执行
MastraAgentRuntimeAdapter SHALL 实现 AgentRuntimePort，将 Orbit agent version、session、Tool/Skill、Memory 和 request context 映射到 Mastra Agent generate/stream，并将 Mastra 输出归一化为 AgentRunResult 与 AgentRuntimeEvent。

#### Scenario: 多步 Tool 对话
- **WHEN** Mastra Agent 产生文本、Tool 调用和 Tool 结果
- **THEN** Adapter 按发生顺序输出规范化 AgentRuntimeEvent
- **AND** 最终结果保留 usage 和 Tool 摘要

#### Scenario: Agent stream 安全边界
- **WHEN** Mastra stream 包含内部 instructions、Tool 定义或凭据信息
- **THEN** Adapter 在产品边界前完成脱敏或抑制
- **AND** 客户端事件不包含敏感内部数据

### Requirement: MastraWorkflowRuntimeAdapter SHALL 从 Workflow IR 构建执行产物
MastraWorkflowRuntimeAdapter SHALL 实现 WorkflowRuntimePort，并 SHALL 以 `workflow-core` IR 为权威输入，根据 workflowId、versionId/contentHash 和 adapterVersion 构建或缓存 Mastra Workflow。Mastra DSL 不得成为产品持久化格式。

#### Scenario: Adapter 版本变化
- **WHEN** IR-to-Mastra 编译规则版本升级
- **THEN** cache key 包含新的 adapterVersion
- **AND** 旧执行产物不得被无条件复用

#### Scenario: Mastra Workflow 暂停
- **WHEN** Mastra 返回 suspended 或 paused
- **THEN** Adapter 输出 Orbit waiting 状态和 run.waiting 事件

#### Scenario: Mastra Workflow tripwire
- **WHEN** Mastra 运行以 tripwire 结束
- **THEN** Adapter 输出 failed 状态
- **AND** 结构化错误保留 tripwire 原因和元数据

### Requirement: MastraToolExecutionAdapter SHALL 保持 Tool 治理
Mastra Tool SHALL 是对 ToolExecutionPort 的薄包装。Tool ID、description 和 schema SHALL 来自现有 Tool/Skill 解析结果，execute SHALL 委托 ToolExecutionPort，并传播 abort signal。

#### Scenario: Tool hooks 记录追踪
- **WHEN** Mastra 执行 Tool
- **THEN** before/after hooks 可记录 trace 和审计关联
- **AND** hooks 不重复执行业务操作

### Requirement: MastraMemoryRuntimeAdapter SHALL 使用统一 resource/thread 映射
Mastra Memory Adapter SHALL 实现 MemoryRuntimePort，并 SHALL 将 Orbit user/project/owner 映射为 resource，将 session/conversation 映射为 thread。Agent Runtime 和直接 Memory API SHALL 使用同一 storage 和所有权规则。

#### Scenario: Agent 写入后通过 Memory API 查询
- **WHEN** Agent 在某 resource/thread 中产生对话消息
- **THEN** MemoryRuntimePort 可从同一 thread 查询这些消息

#### Scenario: 进程重启后读取 Memory
- **WHEN** Agent Service 重启
- **THEN** 合法 resource/thread 的已持久化 Memory 仍可读取

### Requirement: Mastra Adapters SHALL 只负责翻译
Mastra Adapters SHALL 只处理产品 contract 与 Mastra API 的转换、ID 映射、事件归一化和边界脱敏，不得重新实现 Agent loop、Workflow scheduler、Memory retrieval engine 或隐藏 fallback Runtime。

#### Scenario: Mastra 缺少必要能力
- **WHEN** Mastra 无法满足取消、恢复或受限并发等非协商语义
- **THEN** capability gate 明确失败
- **AND** Adapter 不补建第二套调度器伪装支持

### Requirement: Orbit Event Journal SHALL 维护产品事件游标
Mastra Adapter 边界 SHALL 将 Mastra stream/chunk 转换为 Orbit 事件，并 SHALL 为每个 run 原子分配严格递增的产品 event id。SSE 重连 SHALL 使用 Orbit `Last-Event-ID` 或 `since_id`，不得依赖 Mastra 内部 chunk 序号。

#### Scenario: 客户端断线重连
- **WHEN** Agent 或 Workflow 客户端从 event id N 重连
- **THEN** event journal 只回放 id 大于 N 的事件
- **AND** 终态事件后关闭事件流

### Requirement: Mastra Snapshot SHALL 支持 Workflow 暂停恢复
对于声明支持 suspend/resume 的 Workflow，Mastra Adapter SHALL 配置持久化 storage 保存 snapshot，并 SHALL 通过 product runId 与 Mastra runId 映射在重启后查询和恢复。

#### Scenario: 人工审批恢复
- **WHEN** waiting Workflow 收到合法 resume data
- **THEN** Adapter 从 snapshot 恢复指定 step
- **AND** 不重新执行已完成的非幂等 step

### Requirement: NestJS 宿主 SHALL 隔离 Mastra 原生路由
最终 Agent Service SHALL 使用 NestJS Express 平台。MastraModule SHALL 使用独立内部前缀并最后导入，Orbit 产品 controller SHALL 优先匹配。BFF 不得直接转发 Mastra 原生 Agent、Workflow 或 Memory route。

#### Scenario: 请求 Orbit Workflow API
- **WHEN** 客户端请求 `/workflow-runs/:id/events` 或 `/workflow-runs/:id/cancel`
- **THEN** 请求由 Orbit NestJS controller 处理
- **AND** 不进入 Mastra catch-all controller

#### Scenario: 使用非 Express Nest 平台
- **WHEN** Agent Service 使用其他 Nest HTTP adapter 启动 MastraModule
- **THEN** 启动明确失败
- **AND** 不尝试部分集成
