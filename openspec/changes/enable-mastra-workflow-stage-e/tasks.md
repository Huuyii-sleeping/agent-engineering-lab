> 执行原则：严格遵守 AGENTS.md。OpenSpec 只维护本 change 的需求、设计和任务；代码、测试、调试和运行按本清单执行。不得修改 `prd-115-production-sop-workflow-platform` 既有 artifacts，不得恢复 Legacy Runtime，不得在 Mastra Adapter 内实现第二套 scheduler 或 snapshot engine。本 change 受 `all-in-one-agent-workbench` 上位产品基线约束。

## 1. 阶段 E 基线与 Mastra 能力 Spike

- [x] 1.1 固化 `workflow-core` 当前 P0 节点、IR v1、变量作用域和发布校验回归夹具，证明新增阶段 E 契约前测试为绿。
- [x] 1.2 为 Parallel、Iteration、Loop、Subworkflow、Agent 和 Human Approval 增加先失败的 capability gate 测试。
- [x] 1.3 使用锁定的 `@mastra/core@1.52.1` 验证 `.foreach()` 静态 concurrency 与 per-run resolver 在并发 run 和 snapshot replay 中保持上限。
- [x] 1.4 验证 `.foreach()` fail-fast 对活动/等待项的 AbortSignal 行为，记录是否满足 Parallel 取消门槛。
- [x] 1.5 验证 nested Workflow 可作为 foreach、branch、dowhile/dountil step，并确认 snapshot、stream 和错误传播形态。
- [x] 1.6 验证 `.dowhile()`/`.dountil()` 在 0、1、最大次数、取消和进程重启后的 condition 调用次数。
- [x] 1.7 验证 suspend/resume payload、重复 resume、终态 resume、重启恢复和已成功非幂等 step 不重放。
- [x] 1.8 将 spike 结论回写本 change design；能力不满足时保持对应节点 capability 关闭，不增加自研兜底。

## 2. workflow-core 阶段 E 持久化契约

- [x] 2.1 在 `contracts/nodes.ts` 增加 parallel、merge、iteration、loop、subworkflow、agent、human-approval 节点判别联合与公开注释。
- [x] 2.2 定义 `WorkflowSubgraph`、容器输入输出、变量绑定和稳定 subgraph id 契约。
- [x] 2.3 定义 Parallel branch、maxConcurrency、failurePolicy 与 Merge 聚合配置。
- [x] 2.4 定义 Iteration item/index、输入数组、并发度、失败策略、输出聚合和子图配置。
- [x] 2.5 定义 Loop 初始变量、while/until 条件、最大次数、总时长、输出和子图配置。
- [x] 2.6 定义 Subworkflow 不可变 workflowId/versionId/contentHash、输入输出绑定配置。
- [x] 2.7 定义 Agent profile/version、输入绑定、输出 schema 和隔离 Memory 配置，禁止持久化 Runtime 对象或客户端 Tool 白名单。
- [x] 2.8 定义 Human Approval policy reference、展示字段、decision schema、deadline 和超时策略配置。
- [x] 2.9 扩展 NodeDefinition category、config schema、默认配置、端口工厂、validator 和 executor identity。
- [x] 2.10 扩展 JSON schema 校验、稳定序列化、hash 和 unknown node 无损保留，保持 workflow schemaVersion = 2。
- [x] 2.11 在 `test/unit/` 镜像目录补齐每个新增契约与注册定义的单元测试。

## 3. 子图、变量作用域与发布校验

- [x] 3.1 扩展图算法递归校验容器子图 DAG、可达性、端口连接和内部节点 identity。
- [x] 3.2 扩展变量作用域支持 Iteration item/index 与 Loop iteration/variables，并禁止未声明的跨容器引用。
- [x] 3.3 校验 Parallel 分支在对应 Merge 前互不重叠、branch id/port 稳定且 Merge 引用合法。
- [x] 3.4 校验 Iteration 输入必须为数组、配置并发 1–10、元素上限不超过 1000。
- [x] 3.5 校验 Loop 最大次数不超过 1000、总时长不超过 Workflow budget、终止表达式和输出绑定合法。
- [x] 3.6 通过 Workflow version repository 解析 Subworkflow 固定版本，校验 contentHash、递归依赖和最大深度 5。
- [x] 3.7 校验 Agent version、可选外部 approval policy reference 和决策 schema 在发布时存在且可用。
- [x] 3.8 将容器内部节点、动态估算步骤、输出体积和嵌套深度计入统一 resource budget。
- [x] 3.9 增加精确到 container/node/port/field/edge 的发布诊断测试。

## 4. Workflow IR v2 与编译器契约

- [x] 4.1 将 `WORKFLOW_IR_VERSION` 升级为 2，并定义 executable/control/container/child-run/suspend IR 联合。
- [x] 4.2 扩展 resource budget：maxIterationItems、maxLoopIterations、maxNestedDepth、maxWaitingMs 和动态 estimatedSteps。
- [x] 4.3 将 Parallel 到 Merge 的静态分支切片编译为有序 branch IR，并拒绝重叠或无公共 Merge 图。
- [x] 4.4 将 Iteration/Loop 的 `WorkflowSubgraph` 递归编译为嵌套 IR，保留输入输出绑定和变量作用域。
- [x] 4.5 将 Subworkflow 固定版本及其 dependency identity 写入父 IR、dependencies 和 content/cache identity。
- [x] 4.6 将 Agent child-run 与 Human Approval suspend metadata 编译到 IR，不写入凭据、token 或 Runtime 对象。
- [x] 4.7 保持 P0 WorkflowDraft/WorkflowVersion 编译结果与既有行为兼容，并增加 IR v2 golden fixtures。
- [x] 4.8 增加 IR v2 schema、资源预算、确定性序列化和相同输入产生相同 hash 的测试。

## 5. Web 阶段 E Authoring

- [x] 5.1 从共享 registry 将七类阶段 E 节点接入 SOP palette、NodeView 和 inspector registry，不在 Web 重复定义配置类型。
- [x] 5.2 实现统一容器子图编辑器 shell，供 Iteration 和 Loop 复用，并保持 React Flow 只做展示适配。
- [x] 5.3 实现容器进入/退出、面包屑、折叠、选择状态和父子图事务化撤销重做。
- [x] 5.4 实现 Parallel branch 增删改、稳定端口和 Merge 关联/聚合策略 inspector。
- [x] 5.5 实现 Iteration item/index 与 Loop variables 的类型化变量选择器。
- [x] 5.6 实现 Subworkflow 固定版本选择、依赖预检和递归/深度错误展示。
- [x] 5.7a.1 在共享契约定义不可变 AgentVersion、版本锁定 Skill policy、关闭式 Tool policy、output schema 和 `resolvePublishedVersion` resolver，并让发布校验拒绝 identity/schema 不一致。
- [x] 5.7a.2 为 BFF 产品 SQLite 增加 AgentVersion migration 与 repository，按 agentProfileId 事务生成单调版本并保证旧版本不可更新、不可删除。
- [x] 5.7a.3 实现 AgentVersion publish service 与薄 controller；发布请求只接受 createdBy/releaseNotes，运行字段由服务端 AgentProfile 快照和受控默认值生成。
- [x] 5.7a.4 实现只读 `GET /api/agent-versions` catalog、detail API 和 Web API DTO/normalizer，并让 SOP 发布注入同一 repository resolver。
- [x] 5.7a.5 增加共享契约、SQLite repository、发布/API、profile 修改后旧版本不变、伪造 identity/schema 失败的单元与 BFF 回归测试。
- [x] 5.7 实现 Agent 发布版本选择、输入输出配置和隔离 Memory 说明。
- [x] 5.8 实现 Human Approval policy reference、展示字段、decision schema、deadline 和超时策略 inspector。
- [x] 5.9 增加 Web 单元测试，覆盖子图 adapter、端口刷新、变量作用域、未知节点保留和发布错误展示。

## 6. Mastra Parallel、Merge 与 Iteration Runtime

- [x] 6.1 扩展 Mastra Workflow frame，加入 containerId、instanceId、iterationIndex、executionPath 和 childRunId，不泄漏 Mastra 类型到共享契约。
- [x] 6.2 实现 Parallel prepare step，按 IR branch order 输出稳定 branch descriptors。
- [x] 6.3 实现静态 dispatcher nested Workflow，按 branch id 使用 Mastra branch 进入对应 branch Workflow。
- [x] 6.4 使用 `.foreach(dispatcher, { concurrency: resolver })` 实现 Parallel，有效并发为节点、IR 和平台上限最小值且不超过 10。
- [x] 6.5 实现 Merge ordered/by-branch 聚合，以及 fail-fast/collect 结构化结果。
- [x] 6.6 实现 Iteration prepare、bounded foreach body、按 index 聚合和 fail-fast/continue/collect-errors 策略。
- [x] 6.7 为 Parallel/Iteration 实例输出稳定 node status/log/output 事件和严格递增产品 event id。
- [x] 6.8 传播父 AbortSignal，验证活动项取消、等待项不启动和 Merge/后继节点不执行。
- [x] 6.9 增加 Parallel/Merge/Iteration compiler、runtime、事件、错误和取消单元/集成测试。

## 7. Mastra Loop 与 Subworkflow Runtime

- [x] 7.1 实现 Loop prepare frame、iteration count、startedAt、loop variables 和声明输出映射。
- [x] 7.2 使用 `.dowhile()`/`.dountil()` 编译 body Workflow，并在 condition 中同时判断业务表达式和硬限制。
- [x] 7.3 实现 Loop guard step，在硬限制先到达时输出结构化 `WORKFLOW_LOOP_LIMIT_EXCEEDED`。
- [x] 7.4 验证 Loop 取消后不执行下一次 condition/iteration，恢复后 iteration count 不回退或重复。
- [x] 7.5 将固定 Subworkflow IR 编译为 nested Workflow step，并把子版本 identity 纳入 Mastra compiler cache key。
- [x] 7.6 为 Subworkflow 派生稳定逻辑 childRunId 与 executionPath，映射内部事件和结构化错误链。
- [x] 7.7 验证父取消传播到嵌套 Workflow，父恢复不切换子版本且不重放已成功非幂等 step。
- [x] 7.8 增加 Loop/Subworkflow 边界、递归、深度、版本固定、snapshot 和故障恢复测试。

## 8. Agent 节点与 AgentRuntimePort 子运行

- [x] 8.1 新增 Agent node executor，预分配由 parent run、node instance、attempt 派生的 childAgentRunId。
- [x] 8.2 从可信 request context 派生 owner/resource，并创建隔离 session/thread；缺少 owner 时在启动子 run 前失败。
- [x] 8.3 从发布 Agent version 解析 instructions、Tool/Skill policy 和输出 schema，禁止 Workflow 请求扩大白名单。
- [x] 8.4 调用 `AgentRuntimePort.stream` 消费 text、Tool、usage 和终态事件，并映射脱敏 Workflow node 事件。
- [x] 8.5 父 AbortSignal 触发时调用 `AgentRuntimePort.cancel(childAgentRunId)`，查询并收敛稳定子终态。
- [x] 8.6 将 Agent 输出按节点 schema 校验后写入 Workflow frame，错误链保留 parentNodeId 与 childRunId。
- [x] 8.7 增加 Agent Tool/Skill/Memory 隔离、事件、取消、失败、重启和无 fallback 测试。

## 9. Human Approval run-scoped interrupt 与恢复

- [x] 9.1 删除共享层独立 ApprovalRequest、ApprovalStatus、WorkflowCheckpointRef 产品类型，只保留 Human Approval 节点配置、展示值和 decision schema/action 等运行所需最小契约。
- [x] 9.2 删除 `ApprovalControlPort`、Agent HTTP Adapter、BFF Approval module/controller/service/repository、内部 `/internal/approvals` 和相关配置；生产装配不得引用这些边界。
- [x] 9.3 为 BFF 数据库新增兼容迁移，确保新库不创建且现有未发布开发库删除 `approval_requests` 或等价独立审批表，并用 schema 测试证明不存在该产品表。
- [x] 9.4 将 Human Approval executor 改为直接生成稳定 run-scoped interruptId、脱敏 displayFields、decisionSchema、deadline 和 timeoutPolicy 后调用 Mastra suspend，不依赖 BFF 审批记录。
- [x] 9.5 将 WorkflowRuntimePort resume command 收口为通用 interruptId、action、decision data 和 idempotencyKey，并由 Mastra Adapter 从同一 run 的 suspended snapshot 校验 identity、deadline 与 schema。
- [x] 9.6 在 Workflow run 技术存储中实现最小 decision receipt、稳定重复/冲突语义和 per-run resume/cancel/timeout 竞态控制；不得保存独立审批业务状态。
- [x] 9.7 在 BFF `workflow-runs` domain 增加薄 `POST /api/workflow-runs/:runId/resume`，验证当前 waiting identity 后代理 Agent，不提供 Approval 产品资源。
- [x] 9.8 `run.waiting` 投影携带 interruptId/兼容 approvalRequestId、deadline、脱敏 displayFields 和 decisionSchema，且不泄漏 token、hash、checkpoint、snapshot 或内部凭据。
- [x] 9.9 在当前 SOP 测试运行域实现 waiting 审批卡片、decisionSchema 表单和 approve/reject 操作，提交后继续观察同一个 run；离开 run 后不保留全局待办。
- [x] 9.10 为 run mapping、event journal 和 decision receipt 定义并实现 active/waiting 与 terminal retention、TTL 或终态清理，不早于合法恢复窗口。

## 10. 事件、查询与兼容性收口

- [x] 10.1 以可选字段扩展 Workflow node events 与 `run.waiting`，表达 container/instance/index/path/child/interrupt metadata。
- [x] 10.2 必要时新增 `node.instance.status` 与 `run.child` 事件，更新 BFF decoder 跳过未知事件并保持旧事件兼容。
- [x] 10.3 扩展 WorkflowRunSnapshot/NodeRunSnapshot 投影，支持查询当前容器实例、child run 和 waiting interrupt。
- [x] 10.4 保持 `/workflow-runs` start/get/cancel/events 既有 status、错误 shape、SSE 游标和终态关闭行为，并增加 run-scoped resume 的兼容契约。
- [x] 10.5 更新 Web SOP run-state，按 nodeId + instanceId 去重排序，并保持旧 P0 运行展示。
- [x] 10.6 扩展 capability registry，按 parallelMerge、iteration、boundedLoop、nestedWorkflow、agentNode、humanApproval、restartResume 单项开放；Human Approval 修正验收前保持关闭。
- [x] 10.7 更新 runtime-contracts、workflow-core、Agent、BFF 和 Web 跨端兼容测试，删除 Approval 产品契约和旧控制面测试。

## 11. Human Approval 先失败测试与专项回归

- [x] 11.1 增加先失败测试，证明 Sidebar、Agent 管理、Skill Hub、配置页和聊天页没有审批收件箱或伪造审批入口，Human Approval Inspector 仍可配置。
- [x] 11.2 增加先失败测试，证明 `/api/approvals` 列表、详情、决定接口和 `/internal/approvals` 不存在，BFF schema 无 Approval 产品表。
- [x] 11.3 增加先失败测试，覆盖 SOP 当前 run waiting 卡片、approve 分支、reject 分支和 decisionSchema 校验失败不恢复。
- [x] 11.4 增加先失败测试，覆盖相同决定幂等、冲突决定、run identity 冲突、resume/cancel/timeout 竞态和稳定错误。
- [x] 11.5 增加先失败测试，覆盖 SSE 重连、保留期内重新打开同一 waiting run、Agent 进程重启恢复和已成功非幂等节点不重放。
- [x] 11.6 增加先失败测试，覆盖终态或 TTL 后 decision receipt、临时 mapping/event 清理，且 waiting 恢复窗口内数据不被提前删除。
- [x] 11.7 增加静态门禁，证明生产路径为 mastra-only、无 Legacy 活动引用、无 ApprovalControlPort/Repository/产品类型和无敏感 waiting 字段泄漏。

## 12. 综合门禁、浏览器验收与提交

- [x] 12.1 执行 Human Approval 专项 Agent/BFF/Web 测试，真实覆盖 approve、reject、schema、幂等、冲突、超时、取消、重连、重启恢复、非幂等不重放和 TTL 清理。
- [x] 12.2 执行 `pnpm build`、Agent release gate、workflow-core、runtime-contracts、BFF、Web 和相关 smoke 回归；保持 Iteration、Loop、Nested Workflow、Agent 与 P0 能力不回退。
- [x] 12.3 重启 Agent/BFF/Web，在内置浏览器验收 Agent 管理、Skill Hub、SOP Builder、Human Approval Inspector、当前 run waiting 卡片、approve/reject、离开 run 无待办、聊天无伪造审批和 health `mastra-only`。
- [x] 12.4 更新 Stage E 与 Mastra 迁移 capability report，记录 Human Approval run-scoped interrupt 修正后的真实门槛结果，保持 `parallelMerge = false` 结论。
- [x] 12.5 执行三个相关 OpenSpec status/validate、`git diff --check`、PRD-115 零修改、Legacy/归档隔离检查和 workspace/build/test 配置检查。
- [x] 12.6 清理本次测试产生的 `.tasks`、`.team`、`.worktrees`、`.transcripts`、`tmp`、临时 `.memory/.audit/.observability/.security`、数据库和其他运行产物。
- [x] 12.7 精确检查并 staging 本次及既有 Mastra 迁移授权范围内的文件，排除 `.data`、`.workbuddy`、`ai-studio-redesign`、无关 OpenSpec change 和用户本地数据。
- [x] 12.8 完成全部验证与浏览器验收后按真实依赖关系创建 Conventional Commits，不 push；最终汇报 commit hash、验证结果和未推送状态。
