## Why

`apps/agent-cli` 当前自研教学版 Agent 框架同时承担 Agent loop、Workflow 调度、Tool orchestration、Memory 和 Streaming，继续扩展会重复建设成熟框架已有能力，并阻碍 SOP 高级阶段稳定落地。目标不是长期维护两套 Runtime，而是最终由一个 NestJS Agent Service 承载单一 Mastra Runtime，Orbit 仅保留稳定产品协议、业务治理和薄适配层。

## What Changes

### In Scope

- 将最终架构固定为“单一 NestJS Agent Service + 单一共享 Mastra Instance”，Mastra 作为 Agent、Workflow、Tool、Memory 和 Streaming 的唯一运行内核。
- 按职责定义四个框架无关的执行端口：`AgentRuntimePort`、`WorkflowRuntimePort`、`ToolExecutionPort`、`MemoryRuntimePort`，由 `RuntimeGateway` 组合，但不形成大一统超级接口。
- 对话生成、Agent stream、Agent run 查询/取消通过 `AgentRuntimePort`；SOP 启动、查询、取消、SSE、暂停恢复通过 `WorkflowRuntimePort`。
- Tool 直接执行和 Agent/Workflow 内部 Tool 调用统一经过 `ToolExecutionPort`，继续复用 Orbit 的权限、审批、安全和审计。
- Memory thread/message 直接操作通过 `MemoryRuntimePort`，Agent 对话中的 Memory 由 Mastra Memory Adapter 使用同一 resource/thread 映射。
- 新增四类 Mastra Adapter，共享同一个 Mastra Instance，并将 Mastra 状态、事件、错误、run/thread ID 映射为现有 Orbit 产品契约。
- 保留 Web、BFF、Skill Hub、SOP 画布、`workflow-core`、Agent/Workflow HTTP API 和 SSE 产品协议；Mastra 类型不得越过 Adapter 边界。
- 明确区分执行面与控制面：只有需要实际执行 Agent、Workflow、Tool 或 Memory 的请求进入 Runtime Ports；配置、Skill 安装、SOP CRUD、审计和系统设置继续由普通领域 Service 处理。
- 采用限时 Legacy 迁移：仅在迁移阶段保留 legacy adapters。Agent session、Agent run、Workflow run 在创建时显式绑定 `legacy` 或 `mastra`，绑定后所有查询、取消、事件和恢复均使用原后端，禁止中途切换或自动重跑。
- Mastra 全量验收后停止创建 legacy 运行，迁移历史会话与 Memory，最终从 `apps/agent-cli` 和全部生产执行路径删除 legacy runtime、legacy adapters、runtime selector 和 raw Node HTTP host。
- 将迁移前自研教学版 Agent Runtime 源码按原目录结构冻结在仓库根目录 `archive/legacy-agent-runtime/`，只作为历史参考；该归档不得进入 workspace、tsconfig、exports、构建、测试或任何运行时引用图。
- PRD-115 阶段 E capability 按单项门槛恢复：已通过并发限制、循环硬限制、取消、SSE 重连、snapshot、嵌套 Workflow 和人工审批恢复验证的能力可独立进入验收；未通过的 Parallel/Merge 继续暂停。

### Out of Scope

- 本变更不直接编写或迁移生产代码。
- 不修改 `prd-115-production-sop-workflow-platform` 的 proposal、design、specs 或 tasks。
- 不将 Mastra DSL 作为 SOP 画布或 `workflow-core` 的持久化模型。
- 不向 Web/BFF 直接暴露 Mastra 原生 Agent、Workflow、Memory API 或 stream chunk。
- 不长期保留双 Runtime，也不允许运行中自动从 Mastra fallback 到 legacy。
- 不把 `archive/legacy-agent-runtime/` 作为可恢复的备用 Runtime、兼容实现或回滚执行路径。
- 不使用 Mastra Beta 的 Durable Agents、Signals、Schedules 或 Agent Controller 作为首轮生产兼容性的必要依赖。

## Capabilities

### New Capabilities

- `runtime-execution-ports`: 定义 Agent、Workflow、Tool、Memory 四个执行端口、RuntimeGateway、执行面边界和框架无关产品契约。
- `mastra-runtime-adapter`: 定义共享 Mastra Instance 以及 Agent、Workflow、Tool、Memory Adapter 的状态、事件、存储和 NestJS 集成规则。
- `runtime-migration-compatibility`: 定义显式后端绑定、限时 legacy/canary、不可中途切换、回滚、legacy 删除和 PRD-115 阶段 E 恢复门槛。

### Modified Capabilities

<!-- 本变更保持现有产品 capability 的外部行为，新增运行时替换和兼容边界。 -->

## Impact

- Shared：后续在共享层新增 Agent/Workflow/Tool/Memory 运行端口和事件契约；共享包继续禁止依赖 Mastra、Nest、Node HTTP 和具体存储。
- Agent：后续重构 `apps/agent-cli` 的 Agent loop、Workflow Runtime、Tool orchestration、Memory、Streaming、service-api 和 daemon host，最终收口为 NestJS + Mastra + Orbit adapters。
- BFF/Web：保持现有 Agent/Workflow 产品 API 和 SSE 协议，原则上不感知 Mastra。
- Workflow：`workflow-core` 继续是 Workflow Draft/Version/IR 权威模型，Mastra Workflow 只是可重建执行产物。
- Skill Hub/Security：保持 Skill 安装绑定、Tool 权限、审批、安全、凭据和审计协议，由 Mastra Tool Adapter 调用。
- Dependencies：后续引入锁定版本的 `@mastra/core`、`@mastra/nestjs`、`@mastra/memory`、storage provider、Zod 和 NestJS Express 依赖。
- Removal：最终从生产源码和执行路径删除自研 Agent loop、Workflow scheduler/state machine、legacy Memory/Streaming runtime、legacy adapters、runtime selector 和 raw Node HTTP host；允许在 `archive/legacy-agent-runtime/` 保留不可执行、只读的历史源码快照。
