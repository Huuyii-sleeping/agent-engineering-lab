> 执行原则：严格遵守 AGENTS.md。OpenSpec 只维护需求、架构和任务；后续代码、测试、调试与运行由 Superpowers 执行。不得修改 `prd-115-production-sop-workflow-platform` 既有 artifacts，阶段 E capability 只能按单项门槛进入验收。

## 1. 基线、冻结与依赖 Spike

- [x] 1.1 盘点 Agent generate/stream、session、Workflow、Tool、Memory、SSE、daemon 和 HTTP service 的源码入口、数据存储和测试覆盖。
- [x] 1.2 固化现有 Agent 非流式/流式、Tool calling、取消和 session 连续性的回归夹具。
- [x] 1.3 固化 `/workflow-runs` 启动、查询、取消、SSE 游标、终态关闭和错误 shape 的回归夹具。
- [x] 1.4 固化 Tool 权限/审批/安全/审计和 Memory resource/session 隔离的回归夹具。
- [x] 1.5 验证锁定 Mastra、NestJS、Zod、storage provider 与 Node.js 22/24、pnpm 10 的安装和构建兼容性。
- [x] 1.6 验证 `@mastra/nestjs` 的 Express-only、独立 prefix、catch-all 导入顺序和现有路由冲突行为。
- [x] 1.7 验证 Mastra Agent 与 Workflow 的 AbortSignal、停止后续执行、stream 重连、snapshot 和重启查询语义。
- [x] 1.8 固定 Mastra 精确版本、许可证、Node engine、升级策略和首轮 Beta 能力排除清单。

## 2. RuntimeGateway 与四个共享 Port

- [x] 2.1 在共享层定义 `RuntimeGateway`，只组合 Agent、Workflow、Tool、Memory 四个 Port。
- [x] 2.2 定义 `AgentRuntimePort` 的 generate、stream、getRun、cancel、capabilities command/result/event 类型。
- [x] 2.3 定义 `WorkflowRuntimePort` 的 start、get、cancel、events、resume、capabilities command/result 类型。
- [x] 2.4 定义 `ToolExecutionPort` 的 Tool descriptor、list、execute、AbortSignal 和结构化错误类型。
- [x] 2.5 定义 `MemoryRuntimePort` 的 thread CRUD、message read/write、resource/thread 所有权和分页类型。
- [x] 2.6 分别定义 `AgentRuntimeEvent` 与 `WorkflowRuntimeEvent`，只共享最小 run event envelope。
- [x] 2.7 定义 not-found、terminal conflict、ownership conflict、capability unsupported 和 cancellation error 契约。
- [x] 2.8 从共享包 index 导出所有 Port/contract，并验证 Web、BFF、Agent 不重复定义近似类型。
- [x] 2.9 增加依赖边界检查，证明共享 Port 不包含 Mastra、Nest、Node HTTP 或具体 storage import。

## 3. 四个 Port 的共享契约测试

- [x] 3.1 建立 AgentRuntimePort contract harness，覆盖 generate、stream 顺序、Tool 事件、usage、query 和 cancel。
- [x] 3.2 建立 WorkflowRuntimePort contract harness，覆盖启动、状态、游标回放、取消、resume 和终态不可逆。
- [x] 3.3 建立 ToolExecutionPort contract harness，覆盖 schema、权限拒绝、异常上抛、审计和 abort 传播。
- [x] 3.4 建立 MemoryRuntimePort contract harness，覆盖 thread 所有权、消息读写、跨用户隔离、删除和分页。
- [x] 3.5 为 RuntimeGateway 增加组合测试，确认只路由到对应领域 Port，不承载业务逻辑。

## 4. Legacy Adapters 端口化且不改变行为

- [x] 4.1 新增 LegacyAgentRuntimeAdapter，包装当前 Agent loop 与 stream，实现 AgentRuntimePort。
- [x] 4.2 新增 LegacyWorkflowRuntimeAdapter，包装当前 WorkflowRuntimeService，实现 WorkflowRuntimePort。
- [x] 4.3 新增 LegacyToolExecutionAdapter，包装当前 ToolService，实现 ToolExecutionPort。
- [x] 4.4 新增 LegacyMemoryRuntimeAdapter，包装当前 Memory service/store，实现 MemoryRuntimePort。
- [x] 4.5 将现有 Agent chat/stream controller 或 handler 改为依赖 AgentRuntimePort。
- [x] 4.6 将 workflow-runs handler 改为依赖 WorkflowRuntimePort，并保持现有 HTTP/SSE 行为。
- [x] 4.7 将 Tool 直接执行入口改为依赖 ToolExecutionPort。
- [x] 4.8 将 Memory 直接 API 和 Agent session Memory 访问改为依赖 MemoryRuntimePort。
- [x] 4.9 让四个 legacy adapters 全量通过共享 contract harness。
- [x] 4.10 将 legacy capabilities 标记为真实支持值，冻结 legacy 新增能力。

## 5. 共享 Mastra Instance、Storage 与 ID 映射

- [x] 5.1 使用 pnpm 引入锁定版本的 Mastra、Zod、NestJS Adapter 和选定 storage provider。
- [x] 5.2 在 `apps/agent-cli/src/mastra/` 建立 instance、agents、workflows、tools、memory、storage、adapters 目录边界。
- [x] 5.3 实现进程级 Mastra instance factory，统一注册 storage、logger、observability、agents、workflows 和 tools。
- [x] 5.4 将 Mastra 数据根目录接入现有 runtime root、retention 和 cleanup 规则。
- [x] 5.5 实现 product Agent run/Workflow run 与 Mastra runId 的持久映射 repository。
- [x] 5.6 实现 Orbit session/resource/thread 与 Mastra Memory ID 的持久映射和所有权检查。
- [x] 5.7 实现 Agent 与 Workflow 共用基础设施、但分领域保存事件的 Orbit event journal。
- [x] 5.8 为 Mastra factory、storage namespace、run/thread mapping 和重启读取增加单元测试。

## 6. Mastra AgentRuntimeAdapter

- [x] 6.1 实现 agent version/config 到 Mastra Agent definition 的映射和缓存。
- [x] 6.2 将现有 model policy、instructions、request context、Tool/Skill 选择装配到 Mastra Agent。
- [x] 6.3 实现 `generate()` 并映射 text、usage、Tool 摘要和结构化错误。
- [x] 6.4 实现 `stream()` 并映射 text delta、tool input、tool call、tool result、usage、status 和 final result。
- [x] 6.5 实现 Agent run query 和 cooperative cancellation，验证 stream 断开不等于取消。
- [x] 6.6 将 Agent session 的 resource/thread 传入 Mastra Memory，并保持会话连续性。
- [x] 6.7 在产品边界前脱敏 system instructions、Tool definition、凭据和内部配置。
- [x] 6.8 让 MastraAgentRuntimeAdapter 通过 AgentRuntimePort contract harness。

## 7. Mastra WorkflowRuntimeAdapter 与 P0 IR 编译

- [x] 7.1 实现按 `workflowId + versionId/contentHash + adapterVersion` 缓存的 IR-to-Mastra compiler adapter。
- [x] 7.2 将 Start、End、Template、Variable 和纯转换节点映射为 typed Mastra steps。
- [x] 7.3 将 HTTP、Code 和 Knowledge 节点映射为调用现有 Port/Service 的 typed steps。
- [x] 7.4 将 LLM 节点映射为共享 Mastra Instance 中的 Agent step。
- [x] 7.5 将 Tool 节点映射为 Mastra Tool Adapter，并保持 executor identity。
- [x] 7.6 将 Condition/Switch 映射为 `.branch()` 或等价路由，覆盖默认分支和无匹配失败。
- [x] 7.7 支持 node-test、draft、production 三种运行模式，production 只执行不可变版本。
- [x] 7.8 映射 success、failed、suspended、paused、tripwire 和 active run 状态。
- [x] 7.9 实现 Workflow start/query/events/resume 和 cooperative cancellation。
- [x] 7.10 让 MastraWorkflowRuntimeAdapter 通过 WorkflowRuntimePort contract harness。

## 8. Mastra Tool Adapter 与 Skill Hub 兼容

- [x] 8.1 实现从 ToolExecutionPort descriptor 生成 Mastra Tool 的 factory。
- [x] 8.2 保持 Tool ID、description、输入输出 schema 和 Skill binding 身份稳定。
- [x] 8.3 将 Mastra Tool execute 委托 ToolExecutionPort，并传播 AbortSignal。
- [x] 8.4 将 before/after Tool hooks 接入 trace 和审计关联，禁止 hooks 重复执行业务。
- [x] 8.5 保持 Skill Hub 安装、版本、preflight、Agent binding 和 runtime resolve 协议不变。
- [x] 8.6 验证 Agent、Workflow Tool 节点和 Tool 直接 API 使用同一 ToolExecutionPort。
- [x] 8.7 让 Mastra Tool Adapter 通过 ToolExecutionPort contract harness 和安全回归。

## 9. Mastra MemoryRuntimeAdapter 与历史迁移

- [x] 9.1 实现 MemoryRuntimePort 到 Mastra Memory/storage 的 thread 和 message 映射。
- [x] 9.2 首轮启用 message history，并显式关闭 Observational Memory。
- [x] 9.3 分阶段验证 working memory 和 semantic recall 的成本、隔离和保留策略。
- [x] 9.4 盘点 legacy `.memory` 格式、规模、所有权和保留要求。
- [x] 9.5 选择并实现一次性批量导入或访问时迁移方案，使用版本化 namespace。
- [x] 9.6 禁止长期 legacy/Mastra Memory 双写，并记录迁移审计。
- [x] 9.7 验证 Agent 写入后可通过 MemoryRuntimePort 查询同一 thread 数据。
- [x] 9.8 让 MastraMemoryRuntimeAdapter 通过 MemoryRuntimePort contract harness、重启和数据卫生测试。

## 10. 产品事件归一化、SSE 与恢复

- [x] 10.1 实现 Mastra Agent chunks 到 AgentRuntimeEvent 的单一映射器。
- [x] 10.2 实现 Mastra Workflow chunks 到 WorkflowRuntimeEvent 的单一映射器。
- [x] 10.3 为 Agent/Workflow run 原子分配严格递增 Orbit event id。
- [x] 10.4 实现 `Last-Event-ID` / `since_id` 的历史回放、实时订阅和终态关闭。
- [x] 10.5 验证慢消费者和订阅断开只释放连接，不改变运行 backend 或取消状态。
- [x] 10.6 使用 Mastra snapshot 验证 Workflow suspend、重启 query、resume 和非幂等节点不重放。
- [x] 10.7 增加 Agent/Workflow 崩溃、存储暂时不可用、重复事件、乱序和取消竞态故障注入测试。

## 11. 显式 Backend 绑定与 Canary

- [x] 11.1 为 Agent session、Agent run 和 Workflow run 增加持久 `runtimeBackend`、adapterVersion 和 Mastra ID mapping。
- [x] 11.2 实现只在创建前运行的 backend selection policy，支持 `legacy-only`、`explicit-canary` 和 `mastra-default-new`。
- [x] 11.3 实现 Agent/Workflow 白名单和 capability preflight；能力不足时在创建前拒绝或明确选择 legacy。
- [x] 11.4 让 get/cancel/events/resume 严格按已持久化 backend 路由。
- [x] 11.5 禁止已创建 session/run 中途切换或 Mastra 失败后 legacy 自动重跑。
- [x] 11.6 让 rollback 只影响新建 session/run，存量继续由原 backend 管理。
- [x] 11.7 将 shadow 限制在测试环境和 side-effect-free 样例，未知或副作用请求直接拒绝。
- [x] 11.8 将 backend、adapterVersion、Mastra version 和 capability 决策写入健康信息、日志和运行元数据。
- [x] 11.9 增加绑定不可变、canary、rollback、无中途 fallback 和 shadow 副作用隔离测试。

## 12. Agent Service NestJS 宿主迁移

- [x] 12.1 按 Agent、Workflow、Tool、Memory、Sessions、Skills、Security、Audit、Events/Health、MCP 划分 Nest 模块。
- [x] 12.2 创建薄 Nest Agent AppModule 和 main/server 启动装配，保持 CLI/TUI/MCP/daemon 入口薄化。
- [x] 12.3 迁移 health/ready/info 和 daemon 宿主状态路由。
- [x] 12.4 迁移 Agent generate/stream/run controller，使其只依赖 AgentRuntimePort。
- [x] 12.5 迁移 workflow-runs controller，使其只依赖 WorkflowRuntimePort。
- [x] 12.6 迁移 Tool 直接执行 controller，使其只依赖 ToolExecutionPort。
- [x] 12.7 迁移 Memory thread/message controller，使其只依赖 MemoryRuntimePort。
- [x] 12.8 分模块迁移 Sessions、Skills、Security、Audit、Events 和 MCP 控制面路由。
- [x] 12.9 最后导入 `MastraModule.register`，使用 `/internal/mastra` 并验证 catch-all 不拦截 Orbit 路由。
- [x] 12.10 接入 Nest graceful shutdown，验证 daemon lock、SIGINT/SIGTERM、SSE close、storage flush 和 MCP 连接。
- [x] 12.11 建立 raw HTTP 与 Nest 宿主的响应、错误、SSE、health 和 daemon 兼容矩阵。

## 13. Mastra 默认、停止 Legacy 创建与删除可执行 Legacy

- [x] 13.1 在四个 Mastra adapters 和 canary 验收后，将新 Agent session/run 与 Workflow run 默认绑定 Mastra。
- [x] 13.2 完成需延续的 legacy session 与 Memory 数据迁移，并验证所有权和消息数量。
- [x] 13.3 进入 `legacy-create-disabled`，停止创建新的 legacy session/run。
- [x] 13.4 为存量 legacy run 提供查询、取消、排空、显式失败和运维统计。
- [x] 13.5 排空或关闭全部 legacy 活动运行，确认没有待恢复 legacy snapshot/task。
- [x] 13.6 在 Mastra-only 模式执行完整发布窗口和性能观察。
- [x] 13.7 从 `apps/agent-cli` 和生产执行路径删除自研 Agent loop、Workflow scheduler/state machine 和 legacy Streaming runtime。
- [x] 13.8 删除 legacy Agent/Workflow/Tool/Memory adapters 和 backend selector。
- [x] 13.9 删除旧 Memory runtime/store 写路径和 raw Node HTTP host。
- [x] 13.10 清理只服务于迁移的配置、feature flags、shadow runner 和兼容死代码。
- [x] 13.11 验证仓库中不再存在可执行 legacy Agent/Workflow 内核，最终运行路径唯一指向 Mastra；隔离历史归档不计为可执行 Runtime。
- [x] 13.12 将迁移前 `apps/agent-cli/src/**` 按原目录结构冻结到 `archive/legacy-agent-runtime/`，添加 frozen/read-only/non-production README，且不提供 package、tsconfig、exports、构建或测试入口。

## 14. PRD-115 阶段 E 恢复门槛

- [x] 14.1 验证 Parallel/Merge 最大并发 10 并固定受限 foreach 编译方案；活动 sibling fail-fast 取消仍不满足，因此 `parallelMerge` 保持关闭。
- [x] 14.2 验证 Iteration 最大并发、输入规模、失败策略和输出体积硬限制。
- [x] 14.3 验证 Loop 最大次数、总时长、终止条件和取消硬限制。
- [x] 14.4 验证 Nested Workflow 的不可变版本、run/node identity、事件和错误传播。
- [x] 14.5 验证 Agent 节点通过 AgentRuntimePort/Mastra Agent 执行，并保持 Tool/Memory 隔离。
- [x] 14.6 验证 Human Approval 的 suspend/resume schema、snapshot、重复 resume 幂等和重启恢复。
- [x] 14.7 执行 Agent/Workflow 10 个并发运行、持续 SSE、取消竞态和长时间 suspend/resume 基线。
- [x] 14.8 汇总阶段 E capability report；失败能力独立保持暂停。
- [x] 14.9 对已通过门槛的六项能力发起独立用户验收，`parallelMerge` 继续关闭，不自动修改 PRD-115 tasks。

## 15. 全量验证、清理与待验收交接

- [x] 15.1 执行 `pnpm build`，确认 workspace 全量构建通过。
- [x] 15.2 执行 workflow-core 端口与共享 contract tests。
- [x] 15.3 执行 Agent generate/stream、Tool、Memory、Workflow、SSE、取消和恢复的单元/集成/smoke。
- [x] 15.4 执行 Agent service、daemon、security、MCP 和 graceful shutdown 回归。
- [x] 15.5 执行 BFF workflow-runs、Agent proxy、SSE decoder 和 repository 测试。
- [x] 15.6 执行 Web Agent stream、SOP run-state、取消和 SSE 重连测试。
  - `api.test.ts`、`chat-stream-state.test.ts`、`run-state.test.ts` 的目标 8 个用例通过；Web 全量测试 66/67，通过范围之外仅剩既有 Skill Hub fallback catalog 断言失败，本 change 不越权修改该产品域。
- [x] 15.7 分别验证 legacy-only、explicit-canary、mastra-default-new、legacy-create-disabled 和 mastra-only 阶段行为。
  - 历史迁移阶段由 4.x、11.x、13.x 的完成记录与当时 contract/migration gates 证明；当前复验 mastra-only、legacy-removed 和归档隔离，详见 `migration-stage-verification.md`。禁止为复测恢复已删除的 selector 或 legacy runtime。
- [x] 15.8 执行 `openspec status --change "migrate-agent-runtime-to-mastra" --json` 与 `openspec validate "migrate-agent-runtime-to-mastra" --type change`。
- [x] 15.9 清理由测试产生的 `.runtime`、`.memory`、`.audit`、`.observability`、`.security`、`.tasks`、临时数据库和其他运行产物。
- [x] 15.10 检查 Git 状态，确认未修改 PRD-115 artifacts，且只包含本 change 授权的源码、测试和 OpenSpec 变更。
  - PRD-115 diff 为空，`git diff --check` 通过；工作区另有用户已有的 `.data/`、`.workbuddy/`、`ai-studio-redesign/` 与 Skill Hub OpenSpec 内容，本 change 未触碰。
- [x] 15.11 汇报改动文件、最终架构、Mastra 版本、四个 Port 能力矩阵、验证结果、Legacy 可执行删除与只读归档状态和阶段 E 状态，停在用户待验收。
- [x] 15.12 验证 `archive/legacy-agent-runtime/` 未被 pnpm workspace、tsconfig、exports、构建、测试或活动源码引用，并重新执行 release gate 与 OpenSpec 校验。
