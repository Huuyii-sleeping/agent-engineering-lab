## ADDED Requirements

### Requirement: RuntimeGateway SHALL 组合四个领域执行端口
系统 SHALL 提供 `RuntimeGateway`，组合 `AgentRuntimePort`、`WorkflowRuntimePort`、`ToolExecutionPort` 和 `MemoryRuntimePort`。RuntimeGateway SHALL 只负责依赖组合，不得实现 Agent loop、Workflow 调度、Tool 业务逻辑、Memory 检索或运行时 fallback。

#### Scenario: NestJS 注入 RuntimeGateway
- **WHEN** Agent Service controller 需要执行 Agent、Workflow、Tool 或 Memory 操作
- **THEN** controller 从 RuntimeGateway 获取对应领域 Port
- **AND** 不直接依赖 Mastra instance 或具体 adapter

#### Scenario: 组合端口不形成超级接口
- **WHEN** 新增某一领域的运行能力
- **THEN** 该能力加入所属领域 Port
- **AND** 不把所有领域方法合并到一个大一统 RuntimePort

### Requirement: 系统 SHALL 区分执行面与控制面
只有实际执行 Agent、Workflow、Tool、Memory 或查询其运行状态的请求 SHALL 进入 Runtime Ports。Agent 配置、Skill 安装、SOP CRUD/发布、审计查询、凭据配置和系统设置 SHALL 继续由普通领域 Service 处理。

#### Scenario: 启动 Workflow
- **WHEN** controller 收到 Workflow 启动请求
- **THEN** controller 调用 `WorkflowRuntimePort.start`

#### Scenario: 安装 Skill
- **WHEN** controller 收到 Skill 安装请求
- **THEN** controller 调用 Skill 领域 Service
- **AND** 不调用 RuntimeGateway

### Requirement: AgentRuntimePort SHALL 提供稳定对话执行契约
`AgentRuntimePort` SHALL 提供 generate、stream、run query 和 cancel 能力，并 SHALL 使用稳定 agent version、sessionId、resourceId、threadId、request context 和允许的 Tool/Skill 作为输入。该端口不得暴露 Mastra stream 或 Agent 类型。

#### Scenario: 非流式生成
- **WHEN** controller 提交合法 GenerateAgentCommand
- **THEN** AgentRuntimePort 返回规范化 AgentRunResult
- **AND** 结果包含稳定 runId、最终文本、usage 和 Tool 执行摘要

#### Scenario: 流式对话
- **WHEN** controller 提交合法 StreamAgentCommand
- **THEN** AgentRuntimePort 返回 `AsyncIterable<AgentRuntimeEvent>` 或等价框架无关事件流
- **AND** 事件可表示 text delta、tool input、tool call、tool result、usage、status 和 final result

#### Scenario: 取消 Agent run
- **WHEN** 调用方取消仍在执行的 Agent run
- **THEN** AgentRuntimePort 传播取消信号并最终返回稳定终态
- **AND** 断开 stream 订阅不得自动取消 Agent run

### Requirement: WorkflowRuntimePort SHALL 提供稳定 SOP 执行契约
`WorkflowRuntimePort` SHALL 提供 start、query、cancel、events 和 resume 能力，并 SHALL 使用现有 `WorkflowRunSnapshot`、`WorkflowRuntimeEvent` 和运行状态。该端口不得暴露 Mastra Workflow、ReadableStream、Nest Observable 或存储驱动类型。

Workflow 启动命令 SHALL 接受框架无关的 request context。包含 governed Tool 节点时，Agent Service SHALL 从认证或本地宿主边界注入稳定 `ownerId`，并 SHALL 将 product runId 与 nodeId 作为 Workflow executor identity 传播；不得从客户端伪造 Mastra request context 或绕过 ToolExecutionPort。

#### Scenario: 启动发布版本
- **WHEN** production 请求引用不可变 WorkflowVersion
- **THEN** WorkflowRuntimePort 返回 queued/running 的 WorkflowRunSnapshot
- **AND** 运行期间不得读取可变草稿替换定义

#### Scenario: 从事件游标重连
- **WHEN** 客户端以 `sinceId = N` 订阅 Workflow 事件
- **THEN** 端口只返回 id 大于 N 的 WorkflowRuntimeEvent
- **AND** 在终态事件后关闭流

#### Scenario: 恢复暂停 Workflow
- **WHEN** 调用方针对 waiting 运行提交合法 resume data
- **THEN** WorkflowRuntimePort 从对应 snapshot 恢复
- **AND** 不重新执行已成功的非幂等节点

#### Scenario: Tool Workflow 缺少 owner
- **WHEN** Workflow 包含 Tool 节点但启动上下文没有可验证 ownerId
- **THEN** WorkflowRuntimePort 在创建 Mastra run 前明确拒绝
- **AND** 不使用默认共享 owner 绕过权限、审批和审计

### Requirement: ToolExecutionPort SHALL 统一 Tool 执行边界
`ToolExecutionPort` SHALL 提供 Tool 列表和执行能力，Agent、Workflow Tool 节点及 Tool 直接 API SHALL 复用同一端口。端口 SHALL 执行现有权限、审批、安全、凭据、审计和错误上抛规则。

#### Scenario: Agent 调用 Tool
- **WHEN** Agent Runtime 请求执行已解析 Tool
- **THEN** Mastra Tool Adapter 调用 ToolExecutionPort
- **AND** ToolExecutionPort 执行现有安全与审计链路

#### Scenario: Tool 被安全策略拒绝
- **WHEN** 安全或权限规则拒绝 Tool 调用
- **THEN** ToolExecutionPort 返回结构化拒绝错误
- **AND** 不执行底层操作

#### Scenario: Tool 执行被取消
- **WHEN** 上游 Agent 或 Workflow run 被取消
- **THEN** ToolExecutionPort 将 AbortSignal 传播到可取消执行器

### Requirement: MemoryRuntimePort SHALL 统一 Memory 数据访问
`MemoryRuntimePort` SHALL 提供 thread 创建、查询、列表、删除和 message 读写能力，并 SHALL 使用统一 resource/thread 所有权规则。AgentRuntimePort 使用的 Memory 身份映射必须与 MemoryRuntimePort 一致。

#### Scenario: 同一 Session 继续对话
- **WHEN** AgentRuntimePort 使用与既有会话相同的 resource 和 thread
- **THEN** Agent 可读取该 thread 允许保留的历史消息

#### Scenario: 不同用户复用 thread
- **WHEN** 不同 resource 尝试绑定同一 thread
- **THEN** MemoryRuntimePort 拒绝所有权冲突
- **AND** 不串联两个用户的 Memory

#### Scenario: Memory API 查询消息
- **WHEN** 产品 API 查询某个合法 thread 的消息
- **THEN** controller 通过 MemoryRuntimePort 返回与 Agent Runtime 相同存储中的消息

### Requirement: Runtime Ports SHALL 保持框架无关
四个 Runtime Ports SHALL 只依赖共享产品 contract 和标准 TypeScript 类型，不得依赖 Mastra、NestJS、Node HTTP、React 或具体数据库驱动。

#### Scenario: 检查共享包依赖
- **WHEN** 构建和检查 Runtime Port 所在共享包
- **THEN** 产物中不存在 Mastra、NestJS、Node HTTP 或具体 storage provider import

### Requirement: Agent 与 Workflow SHALL 使用独立事件联合
系统 SHALL 分别定义 `AgentRuntimeEvent` 和 `WorkflowRuntimeEvent`，两者 MAY 共享最小 run event envelope，但不得强行合并不同领域语义。事件 id SHALL 在单个 run 内严格递增。

#### Scenario: Agent Tool 输入流
- **WHEN** Mastra Agent 产生 tool input delta
- **THEN** 系统输出 AgentRuntimeEvent
- **AND** 不伪装成 Workflow node output

#### Scenario: Workflow 节点状态变化
- **WHEN** Mastra Workflow step 状态变化
- **THEN** 系统输出 WorkflowRuntimeEvent
- **AND** 保持现有 run/node 状态协议

### Requirement: Runtime Ports SHALL 具备共享契约测试
系统 SHALL 为四个 Port 建立可复用 contract test harness，验证结构化错误、取消、运行查询、事件顺序、身份隔离和终态语义。Legacy 与 Mastra adapters 在迁移期间 SHALL 使用同一套断言。

#### Scenario: Adapter 进入 Canary
- **WHEN** 任一 Mastra adapter 准备进入 canary
- **THEN** 该 adapter 必须先通过所属 Port 的共享契约测试
