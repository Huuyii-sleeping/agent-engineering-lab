## Why

Mastra-only P0 Runtime 已稳定替代自研 Agent Runtime，但 PRD-115 阶段 E 仍缺少 Parallel/Merge、Iteration、Loop、Subworkflow、Agent 和 Human Approval 的持久化节点、Workflow IR 与恢复语义。现在需要在 `all-in-one-agent-workbench` 上位产品基线下补齐框架无关契约和 Mastra 原生能力编译方案，确保 Workflow 仍是 Agent 内部编排能力，Human Approval 仍是具体 run 的 runtime interrupt，而不形成第二套调度器、状态机或审批产品。

## What Changes

### In Scope

- 扩展 `workflow-core` 的内置节点契约、节点注册表和 Workflow IR，表达 Parallel/Merge、Iteration、Loop、Subworkflow、Agent 和 Human Approval。
- 定义可复用的容器子图模型、item/index/loop 变量作用域、输入输出绑定和嵌套深度校验；顶层和容器内部继续保持 DAG。
- 固定受控 Mastra 编译策略：Iteration 使用 `.foreach()`；Parallel 分支通过带并发上限的 `.foreach()` 分发到静态分支 Workflow；Loop 使用 `.dowhile()`/`.dountil()` 并注入硬终止门槛。
- 将最大并行度固定为 10，并为 Iteration/Loop 定义输入规模、最大次数、总时长、输出体积、失败策略和取消传播。
- Subworkflow 只允许引用不可变发布版本，持久化父子 product run/node identity，并限制递归与嵌套深度。
- Agent 节点通过 `AgentRuntimePort` 启动和观察子 Agent run，继承稳定 owner/resource/thread 身份，保持 Tool、Skill、Memory 和审计隔离。
- 新增不可变 `AgentVersion` 产品发布能力：BFF SQLite repository、从可变 AgentProfile 发布版本、只读 catalog/detail API 和 Web/Workflow 共用 resolver；版本快照固定 instructions、Tool/Skill policy 与 output schema。
- Human Approval 使用同一 Mastra run 的 suspend/waiting/resume；恢复、安全和幂等所需的最小信息只能作为具有 TTL 的 run-scoped 技术状态，不建立 ApprovalRequest、Approval Repository、审批表或后台审批控制面。
- `run.waiting` 公开 interruptId、兼容 approvalRequestId、脱敏展示字段、decision schema 和 deadline，供当前 SOP 测试运行面板临时渲染审批卡片；公共 Web/BFF 不提供审批收件箱、列表、详情、筛选或历史入口。
- 扩展 Workflow 运行事件与快照，稳定表达容器实例、iteration index、child run 和 interrupt waiting/resumed，同时保持现有 `/workflow-runs`、SSE envelope、取消和查询兼容；决定统一通过具体 run 的 resume 命令提交。
- 建立阶段 E capability gates、10 并发持续 SSE、取消竞态、进程重启恢复、长时间 waiting/resume 和非幂等节点不重放测试。
- 阶段 E capability 按单项门槛独立开放；某项失败只关闭该项及显式依赖能力，不阻塞已经通过且无依赖关系的能力。
- 最新稳定版 `@mastra/core@1.55.0` 重新 spike 后仍不能在 foreach fail-fast 时取消已活动 sibling，因此 `parallelMerge` 继续关闭；Iteration、Loop、Nested Workflow 和 Agent 的既有结论保持，Human Approval 与其 restart/resume 子门槛在 run-scoped interrupt 修正后重新验收。
- 按单项门槛回填 `migrate-agent-runtime-to-mastra` 的 14.1–14.7 验证结果，并发起独立用户验收；不自动修改 PRD-115 tasks。

### Out of Scope

- 不修改 `openspec/changes/prd-115-production-sop-workflow-platform/` 既有 proposal、design、specs 或 tasks。
- 本 change 的 OpenSpec 阶段不编写生产代码；代码、测试、调试和运行后续按 tasks 交给 Superpowers。
- 不实现阶段 F 的 Webhook、Schedule、Event Trigger 或 Agent 对 Workflow 引用。
- 不在尚未实现 Agent 对 Workflow 引用时伪造聊天审批卡片；对话中的上下文审批留待该调用链具备后复用同一 `run.waiting` 契约。
- 不提供独立 Approval 产品实体、repository、数据库表、内部控制面、公共列表/详情/决定 API 或长期审批业务状态。
- 不实现阶段 G/H 的完整运行历史、成本分析、第三方节点 SDK、模板和大图性能体验。
- 不允许在 Mastra Adapter 内实现独立 Workflow scheduler、通用任务队列或自研 snapshot engine。
- 不恢复 Legacy Runtime、legacy adapters、selector 或归档代码引用。
- 不依赖 Mastra Durable Agents、Signals、Schedules 或 Agent Controller Beta API。
- 不以升级 Mastra、降低 Parallel fail-fast 语义或引入自研 sibling scheduler 伪装解决 `parallelMerge` 阻塞。

## Capabilities

### New Capabilities

- `workflow-stage-e-authoring-contract`: 定义阶段 E 节点、容器子图、变量作用域、发布校验、不可变子流程引用和编辑器/注册表边界。
- `workflow-stage-e-mastra-runtime`: 定义受限并行、迭代、循环、嵌套 Workflow、AgentRuntimePort 子运行、事件身份、取消和资源门槛的 Mastra 编译与运行语义。
- `workflow-stage-e-approval-recovery`: 定义 Human Approval 的 run-scoped interrupt、通用 resume、幂等技术状态、Mastra snapshot 重启恢复、TTL 清理和非幂等节点不重放语义。

### Modified Capabilities

<!-- PRD-115 的既有 capability 仍由原 change 管理，本 change 不直接修改其 artifacts。 -->

## Impact

- Shared：`packages/workflow-core` 将新增阶段 E 节点配置、子图/绑定类型、IR container/child-run identity、事件与资源预算契约。
- Agent：`apps/agent-cli/src/mastra/workflows/**` 将扩展 IR-to-Mastra compiler、frame、Workflow/Agent 子运行和 suspend/resume 映射；继续使用单一共享 Mastra Instance。
- Runtime Contracts：`WorkflowRuntimePort` 保持现有 start/get/cancel/events/resume 方法，必要新增字段采用向后兼容可选字段和新的事件联合成员。
- BFF：只保留薄的 `/api/workflow-runs/:runId/resume` 运行入口与必要的 run-scoped 权限/幂等校验；删除 Approval 产品模块、repository、表和独立接口。
- Web：新增统一容器子图编辑器、阶段 E inspector 和运行实例展示；Human Approval 卡片只在当前 SOP 测试 run waiting 时出现，未来对话宿主具备真实调用链后再复用同一契约。
- Storage：Mastra snapshot 保存唯一可恢复执行状态；Orbit 只保存具有 TTL 的 run mapping、事件游标和必要的恢复幂等 receipt，不保存 Approval 产品状态或复制 Mastra 内部 snapshot。
- Safety：新增并发、循环、输入输出体积、嵌套深度、等待时长、权限和幂等硬门槛。
- Release：共享 capability 默认矩阵只开放已经通过门槛的六项能力；`parallelMerge` 在 BFF 发布与 Agent 启动两端保持关闭。
