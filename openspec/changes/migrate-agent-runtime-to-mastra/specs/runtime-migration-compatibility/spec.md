## ADDED Requirements

### Requirement: Legacy Runtime SHALL 仅作为限时迁移机制
系统 SHALL 将生产路径中的 legacy runtime、legacy adapters 和 runtime selector 视为临时迁移代码。Legacy SHALL 冻结新增能力，并 SHALL 在 Mastra 全量验收与存量排空后从 `apps/agent-cli`、workspace 和可执行依赖图删除。

#### Scenario: 迁移初期
- **WHEN** Mastra 尚未通过 canary 门槛
- **THEN** 当前实现通过 legacy adapters 接入四个 Runtime Ports
- **AND** 不改变现有产品行为

#### Scenario: 完成迁移
- **WHEN** Mastra-only 验收和发布窗口通过
- **THEN** 从生产源码和执行路径删除 legacy Agent/Workflow/Memory/Streaming runtime、legacy adapters 和 selector
- **AND** 可在 `archive/legacy-agent-runtime/` 保留不可执行的历史源码快照

### Requirement: Legacy 源码归档 SHALL 保持冻结且不可执行
系统 MAY 在 `archive/legacy-agent-runtime/` 按原目录结构保存迁移前教学版 Agent Runtime 源码，但该目录 SHALL 标记为 frozen、read-only、non-production，并 SHALL 排除在 pnpm workspace、tsconfig、package exports、构建、测试和生产运行引用图之外。

#### Scenario: 保留历史源码
- **WHEN** 团队需要查阅迁移前的 Agent loop、Workflow、Memory 或 Streaming 实现
- **THEN** 只从 `archive/legacy-agent-runtime/` 阅读历史源码
- **AND** 不把归档作为可运行或可恢复的备用 Runtime

#### Scenario: 生产代码尝试引用归档
- **WHEN** `apps/agent-cli`、NestJS、RuntimeGateway、Mastra Adapter 或 workspace package 引用归档路径
- **THEN** 依赖边界测试失败
- **AND** 发布门不得通过

### Requirement: Session 与 Run SHALL 在创建时绑定 Runtime Backend
迁移期间 Agent session、Agent run 和 Workflow run SHALL 在创建时持久化 `runtimeBackend: legacy | mastra`、adapterVersion 及必要的 Mastra ID 映射。绑定完成后查询、取消、事件和恢复 SHALL 始终路由到原 backend。

#### Scenario: 创建 Mastra Agent Session
- **WHEN** canary policy 选择 Mastra 创建新 Agent session
- **THEN** session 持久化 `runtimeBackend = mastra`
- **AND** 后续对话和 Memory 使用 Mastra backend

#### Scenario: 查询既有 Workflow Run
- **WHEN** 客户端查询已绑定 legacy 的 Workflow run
- **THEN** 系统仍通过 legacy adapter 查询
- **AND** 不因当前默认值变为 Mastra 而切换后端

### Requirement: 活动 Session 与 Run SHALL 禁止中途切换或自动 Fallback
创建后的 Agent session/run 和 Workflow run SHALL 不得在 backend 之间切换。Mastra 执行失败、SSE 断开或 capability 错误不得触发 legacy 自动重跑。

#### Scenario: Mastra Workflow 运行失败
- **WHEN** 已绑定 Mastra 的 Workflow run 执行失败
- **THEN** 该运行按 Mastra 结果收敛 failed
- **AND** 不在 legacy 中重新执行

#### Scenario: Agent SSE 断开
- **WHEN** 已绑定 Mastra 的 Agent stream 客户端断开
- **THEN** session/run backend 保持 Mastra
- **AND** 不自动切换 legacy 或创建重复 run

### Requirement: Canary SHALL 只在创建前显式选择 Backend
Canary policy SHALL 仅基于明确白名单、版本、环境和已验证 capability 为新的 session/run 选择 backend。未知或能力不足场景 SHALL 在创建前拒绝或明确选择 legacy，不得创建后再 fallback。

#### Scenario: 白名单 Workflow 满足能力
- **WHEN** 白名单 Workflow 所需 capability 已验证
- **THEN** 新 run 可绑定 Mastra

#### Scenario: Mastra 缺少必要取消能力
- **WHEN** Workflow 要求取消但 Mastra capability 未通过
- **THEN** 系统在创建前拒绝 Mastra 绑定或按明确 policy 选择 legacy
- **AND** 不虚报 Mastra 支持

### Requirement: Rollback SHALL 只影响新建 Session 与 Run
迁移期 rollback policy SHALL 只改变后续新建 session/run 的 backend 选择。已创建运行 SHALL 继续由原 backend 管理，除非用户明确终止或执行一次性离线迁移。

#### Scenario: Canary 回滚
- **WHEN** 运维停止 Mastra canary
- **THEN** 新 session/run 绑定 legacy
- **AND** 已有 Mastra session/run 继续由 Mastra 查询、取消和排空

### Requirement: Shadow SHALL 仅用于无副作用测试
Shadow 对比 SHALL 仅在测试或隔离环境对明确 side-effect-free 的请求启用。写文件、Shell、通知、外部写请求或未知 Tool/节点 SHALL 禁止双执行。

#### Scenario: 只读样例进入 Shadow
- **WHEN** 所有 Agent Tool 或 Workflow 节点均明确无副作用
- **THEN** 系统可比较 legacy 与 Mastra 输出和事件

#### Scenario: 样例包含写副作用
- **WHEN** Shadow 请求包含非幂等操作
- **THEN** 系统拒绝影子执行

### Requirement: 迁移 SHALL 具有停止 Legacy 创建与删除阶段
迁移流程 SHALL 明确包含 `legacy-only`、`explicit-canary`、`mastra-default-new`、`legacy-create-disabled`、`mastra-only` 和 `legacy-removed` 阶段。完成标准 SHALL 包含停止创建 legacy 状态、排空存量，以及从生产源码和执行路径删除 legacy 代码。不可执行归档不属于运行时保留。

#### Scenario: 进入 legacy-create-disabled
- **WHEN** 新建 Agent/Workflow/Memory 已默认使用 Mastra且兼容门槛通过
- **THEN** 系统停止创建新的 legacy session/run
- **AND** 只保留存量查询、取消和排空能力

#### Scenario: 进入 legacy-removed
- **WHEN** 存量 legacy 状态已迁移、终止或排空
- **THEN** 仓库不再包含可执行 legacy Agent/Workflow 内核和 runtime selector
- **AND** 任何保留的历史源码只存在于隔离归档且不进入生产依赖图

### Requirement: Mastra-only 前 SHALL 通过全领域兼容门槛
Mastra-only 切换前 SHALL 通过 Agent、Workflow、Tool、Memory 四个 Port 的 contract tests，以及流式重连、取消、snapshot、重启、权限、安全、数据隔离和性能基线。

#### Scenario: 任一领域门槛失败
- **WHEN** Agent stream、Workflow cancel、Tool governance、Memory ownership 或其他关键门槛失败
- **THEN** 系统不得进入 mastra-only 或删除 legacy

### Requirement: PRD-115 阶段 E Capability SHALL 在相关 Mastra Runtime 门槛通过后独立恢复
PRD-115 阶段 E 的 Parallel/Merge、Iteration、Loop、Subworkflow、Agent、Human Approval 和 checkpoint recovery SHALL 分别保持暂停，直到对应的并发限制、循环硬限制、取消、SSE、snapshot、嵌套和恢复门槛验收通过。某项失败 SHALL 只阻止该项及其显式依赖能力，不得阻止已经通过全部相关门槛的其他 capability 进入独立验收。

#### Scenario: 仅完成 P0 Workflow
- **WHEN** Mastra 已支持顺序、分支和基础节点，但高级能力尚未全部验证
- **THEN** PRD-115 阶段 E 继续暂停

#### Scenario: 阶段 E 单项恢复评审
- **WHEN** Iteration、Loop、Subworkflow、Agent、Human Approval 和 checkpoint recovery 已通过对应门槛
- **AND** Parallel/Merge 仍因活动 sibling 取消语义失败
- **THEN** 团队对已通过的六项能力发起独立用户验收
- **AND** Parallel/Merge capability 继续保持关闭
- **AND** 不自动修改 PRD-115 tasks

### Requirement: 首轮生产路径 SHALL 排除非必要 Beta 依赖
首轮生产迁移 SHALL 不以 Mastra Durable Agents、Signals、Schedules 或 Agent Controller 的 Beta API 作为 Agent、Workflow、Tool、Memory 核心兼容性的必要条件。

#### Scenario: Beta API 发生变化
- **WHEN** Mastra Beta API 在升级中发生破坏性变化
- **THEN** 四个 Runtime Ports 的核心产品契约不受影响
