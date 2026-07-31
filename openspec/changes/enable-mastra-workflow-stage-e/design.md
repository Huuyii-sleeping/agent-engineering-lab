## Context

`migrate-agent-runtime-to-mastra` 已完成 Mastra-only P0 生产路径：NestJS Agent Service、四个 Runtime Port、共享 Mastra Instance、P0 Workflow IR 编译、SSE、取消、snapshot 和恢复均已通过发布门。当前 compiler 只支持顺序 `.then()` 与 Condition `.branch()`；`workflow-core` 的内置节点联合也只包含 P0 节点。

PRD-115 阶段 E 已定义业务目标，但尚无可直接实现的阶段 E 节点配置、容器子图、IR、实例身份、interrupt 幂等和 Mastra 编译决策。本 change 同时受 `all-in-one-agent-workbench` 上位产品基线约束：Workflow 只是 Agent 的内部编排能力，Human Approval 只是具体 run 的 runtime interrupt，平台不得拥有独立审批业务状态。若直接在 Adapter 中补 Promise 池、循环调度、子流程轮询、checkpoint state machine 或在 BFF 建立 Approval Repository，都会再次形成自研 Runtime 或第二执行权威源。

锁定版本 `@mastra/core@1.52.1` 提供以下可用基础：

- `.foreach(step, { concurrency })`，并发度可使用每次运行解析的 resolver。
- `.parallel()`，但没有并发上限，因此不能直接用于生产 Parallel。
- `.dowhile()` 与 `.dountil()`。
- nested Workflow 可作为 step 进入 branch/loop/foreach 控制流。
- step suspend/resume、持久 Workflow snapshot、AbortSignal 和 active run 查询。

本 change 只生成阶段 E 的 OpenSpec 设计和任务清单，不修改 PRD-115 既有 artifacts，不在本阶段编写代码。

## Goals / Non-Goals

**Goals:**

- 定义 Web、BFF、Agent 共用的阶段 E 持久化节点、子图、IR 和事件契约。
- 使用 Mastra 原生 foreach、loop、nested workflow 和 suspend/resume 完成高级控制流。
- 将 Parallel/Iteration 最大并发硬限制为 10，并让限制在并发运行和重放中保持一致。
- 为 Iteration、Loop、Subworkflow 和 Agent 子运行建立稳定 instance identity、变量作用域与错误链。
- 让 Agent 节点通过 AgentRuntimePort 运行，不绕过 Tool、Skill、Memory、安全和审计边界。
- 让 Human Approval 在进程重启、网络重试、重复决定和取消竞态中保持幂等一致。
- 保持 `/workflow-runs`、WorkflowRuntimePort 和 SSE envelope 向后兼容。
- 全部门槛通过前继续保持阶段 E 节点不可用于生产发布。

**Non-Goals:**

- 不修改 PRD-115 proposal、design、specs 或 tasks。
- 不实现阶段 F/G/H 的触发器、完整观测治理、模板、SDK 或体验抛光。
- 不引入独立 scheduler、队列、snapshot engine 或 Legacy Runtime。
- 不将 Mastra DSL、step graph、chunk 或 snapshot 作为产品持久化协议。
- 不依赖 Durable Agents、Signals、Schedules 或 Agent Controller Beta。
- 首轮 Human Approval 不接邮件、IM、第三方通知或独立 Web inbox；只提供绑定具体 Workflow run 的 waiting 投影和决定命令。
- 不建立 ApprovalRequest 产品实体、Approval Repository、审批表、内部审批控制面、全局审批 API 或长期审批业务状态。

## Decisions

### 1. Workflow schemaVersion 保持 2，阶段 E 节点使用独立 node version

新增内置节点类型：

```text
parallel
merge
iteration
loop
subworkflow
agent
human-approval
```

工作流文档 envelope、edge、port、VariableRef 和 UnknownWorkflowNode 语义不变，因此不提升全局 `schemaVersion`。每个新节点从 `node.version = 1` 开始；旧客户端通过 UnknownWorkflowNode 无损保留未识别节点。

备选：升级整个 Workflow 到 schema v3。未采用，因为本次没有改变文档 envelope，强制迁移全部 P0 草稿只会扩大风险；节点级版本已经能承载独立演进。

### 2. Iteration 与 Loop 共用 WorkflowSubgraph

新增框架无关子图契约：

```ts
type WorkflowSubgraph = {
  id: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  inputs: Array<{ id: string; name: string; dataType: WorkflowValueType }>;
  outputs: Array<{ id: string; name: string; value: VariableRef }>;
};
```

容器 config 保存子图、输入输出绑定和运行策略。子图内部保持 DAG；循环只由外层 Loop 控制语义表达。发布编译递归校验子图，并将全部嵌套节点计入同一 resource budget。

Iteration 注入只读 `item`、`index`；Loop 注入 `iteration`、显式 loop variables 和上次迭代输出。外部只读取容器声明的 outputs。

备选：每个容器保存任意 React Flow JSON。未采用，因为会让共享编译器依赖 UI，并为不同容器复制迁移和校验逻辑。

备选：顶层允许任意回边表达 Loop。未采用，因为无法可靠执行静态预算、恢复和终止分析。

### 3. Parallel/Merge 使用顶层静态分支，不使用容器子图

Parallel 通过稳定 branch id 生成多个输出端口；分支继续使用顶层图表达，并在对应 Merge 处汇合。配置为：

```ts
type ParallelNodeConfig = {
  branches: Array<{ id: string; label: string }>;
  maxConcurrency: number;
  failurePolicy: "fail-fast" | "collect";
};

type MergeNodeConfig = {
  parallelNodeId: string;
  strategy: "ordered" | "by-branch";
  allowMissing: boolean;
};
```

编译器识别 Parallel 到 Merge 之间互不重叠的静态分支。分支在 IR 中保存确定顺序，Merge 输出不依赖异步完成顺序。

备选：Parallel 内嵌 branches 子图。未采用，因为顶层分支已经能被现有画布、类型端口和图校验表达，再嵌套一层会增加编辑成本。

### 4. Workflow IR 升级为 v2 并保留嵌套结构

`WORKFLOW_IR_VERSION` 升级为 2。IR node 使用结构化联合：

```text
executable node
parallel control node + branch IRs + merge contract
iteration container + body IR
loop container + body IR
subworkflow reference + compiled dependency identity
agent child-run node
human approval suspend node
```

IR v2 的 resource budget 新增：

```text
maxParallelism = 10
maxIterationItems = 1000
maxLoopIterations = 1000
maxNestedDepth = 5
maxRuntimeMs = 24 hours
maxOutputBytes = 1 MiB
maxWaitingMs = 30 days
```

默认 Human Approval deadline 为 7 天，配置不得超过 30 天。所有嵌套节点展平计入 200 nodes、400 edges 和 1000 estimated steps；动态 Iteration/Loop 使用上限估算，不得仅按静态节点数估算。

备选：继续让 IR v1 的 `WorkflowIRNode` 用 config 临时承载容器。未采用，因为 runtime 无法区分可执行节点和控制结构，资源预算也无法表达动态实例。

### 5. Parallel 编译为 prepare + bounded foreach + dispatcher + merge

`.parallel()` 没有并发上限，因此生产 Parallel 不直接调用它。编译步骤：

1. prepare step 将父 frame 转换为按 IR branch order 排列的 branch descriptors。
2. `.foreach(dispatcherWorkflow, { concurrency: resolver })` 执行 descriptors。
3. resolver 返回 `min(node.maxConcurrency, ir.resourceBudget.maxParallelism, 10)`，不修改共享 options，保证并发 run 之间无竞态并可被 durable replay 重算。
4. dispatcherWorkflow 根据 branch id 使用 `.branch()` 进入已编译的静态 branch Workflow。
5. merge step 按 branch order 聚合结果。

`fail-fast` 由首次未处理分支错误触发父 foreach 失败和 AbortSignal；`collect` 将每个分支结果规范化为 `{ branchId, status, output?, error? }` 后交给 Merge。

备选：在 Adapter 中实现 Promise semaphore。未采用，因为会绕过 Mastra step lifecycle、snapshot、stream 和 cancellation，形成隐藏 scheduler。

备选：直接 `.parallel(branches)`。未采用，因为无法保证最大并发 10。

### 6. Iteration 直接编译为 bounded foreach

Iteration 编译步骤：

1. prepare step 解析数组输入，在执行任何 body 前校验数组长度不超过 1000。
2. 为每项生成 `{ containerId, instanceId, item, index, parentFrame }`。
3. `.foreach(bodyWorkflow, { concurrency: resolver })` 执行统一子图，resolver 限制在 1–10。
4. collect step 按 index 聚合结果，并执行 `fail-fast`、`continue` 或 `collect-errors` 策略。
5. 输出写入容器 node output，内部 node outputs 只作为实例事件和 snapshot 状态存在。

首轮失败与聚合输出固定为：`fail-fast` 在首个未处理失败时终止且不产生 Merge 输出；`continue` 保留全部输入 index，失败槽位写入 `null`；`collect-errors` 为每个 index 输出 `{ index, status, output?, error? }`。`aggregation = ordered` 输出按 index 排列的数组，`aggregation = by-index` 输出以十进制 index 为键的对象。该形态不依赖异步完成顺序，且不会因跳过失败项而改变后续 index。

`instanceId` 由 `parentRunId + containerNodeId + index` 稳定派生，同一 run 重放和恢复不得改变。

备选：为每个 item 动态创建并注册独立 Workflow。未采用，因为会污染共享 registry、增加缓存和恢复身份复杂度。

### 7. Loop 使用 dountil/dowhile，硬门槛进入 frame 和 condition

Loop config 明确：

```text
mode: while | until
condition expression
initial variables
maxIterations <= 1000
timeoutMs <= remaining workflow budget
body subgraph
declared outputs
```

prepare step 初始化 loop frame：`iteration = 0`、`startedAt`、loop variables。bodyWorkflow 每次返回下一帧并递增 iteration。Mastra loop condition 同时检查业务表达式和硬门槛：

- 若业务条件满足，正常结束。
- 若达到最大次数、deadline、取消或输出体积上限，停止下一次执行。
- 若因硬门槛停止且业务条件未满足，后续 guard step 抛出结构化 `WORKFLOW_LOOP_LIMIT_EXCEEDED`。

备选：在单个 step 内使用 JavaScript `while`。未采用，因为中间迭代没有 Mastra snapshot、step stream 或合作式取消边界。

### 8. Subworkflow 编译为固定版本的 nested Workflow step

发布时通过 repository 解析 `workflowId + versionId + contentHash`，递归编译目标 IR，并将依赖 identity 写入父 IR/cache key。依赖图在发布时检测直接/间接递归，嵌套深度最大 5。

首轮 child run 是产品逻辑身份，不单独创建第二个 Mastra native run：

```text
childRunId = stable(parentRunId, parentNodeInstanceId, childVersionId)
nativeRunId = parent native run
executionPath = parent/childNode/internalNode
```

父运行快照和事件可定位 childRunId、版本和内部节点；取消由父 native run AbortSignal 自然传播。未来若需要独立子流程运维，可在不改变持久化节点引用的前提下升级为独立 native run。

备选：Subworkflow step 调用 WorkflowRuntimePort.start 并轮询另一运行。未采用，因为会引入父子 run 协调器、重复 snapshot 和取消竞态。

### 9. Agent 节点通过 AgentRuntimePort stream 创建子运行

Agent 节点 config 固定发布的 Agent version。可变的 AgentProfile 只属于 Authoring 草稿，不得作为 Workflow 运行时版本来源；产品层 SHALL 提供不可变 AgentVersion repository、发布入口和只读 catalog API，Web 只允许选择 catalog 中的已发布版本，Runtime resolver 使用同一 identity。不得使用 `updatedAt`、Skill 版本拼接或当前 profile 快照伪造 `agentVersionId`。

实现阶段发现当前仓库只有可变 AgentProfile CRUD，尚无上述不可变 AgentVersion 产品源。因此 5.7 与 8.3 在该 repository/API 完成前保持阻塞，`agentNode` capability 继续关闭；该缺口不允许通过 Web 自由文本或 Mastra definition cache 兜底。

首轮 `AgentVersion` 使用 BFF 已有产品 SQLite 作为唯一权威存储，每次发布从当前规范化 AgentProfile 创建新记录，不覆盖旧记录：

```text
id / agentProfileId / version / contentHash
name / description
instructions[]
toolPolicy.allowedToolIds[]
skillPolicy.bindings[]
outputSchema
createdBy / releaseNotes / createdAt
```

其中 `version` 是同一 AgentProfile 下事务生成的单调整数，`id` 是稳定版本标识，`contentHash` 对规范化快照计算。`updatedAt` 只属于可变 AgentProfile，不进入版本 identity。首轮 AgentProfile 尚无显式 Tool 绑定字段，因此发布快照的 `allowedToolIds` 默认为空，禁止沿用当前对话入口“全部工具可用”的兼容行为；已固定的 Skill bindings 原样进入版本快照。后续若增加 Agent Tool authoring，必须由独立产品字段显式发布，不能由 Workflow 请求临时扩大。

`outputSchema` 的唯一权威来源是 AgentVersion。首轮未提供 Agent 级 schema authoring 时发布默认 `{ "type": "object", "properties": { "text": { "type": "string" } }, "required": ["text"], "additionalProperties": false }`，与 Agent 节点 object 输出端口保持一致。Agent 节点仍冗余保存该 schema，使草稿、导出和 IR 可以自描述；Web 选择版本时自动写入且只读展示，发布 resolver 必须校验节点 schema 与版本快照完全一致。这样既不让运行时依赖可变 profile，也不允许 Workflow 为同一版本声明互相冲突的输出契约。

BFF 对外提供：

```text
POST /api/agents/:agentProfileId/versions
GET  /api/agent-versions?agentProfileId=...
GET  /api/agent-versions/:agentVersionId
```

发布入口只接受发布元数据，不接受 instructions、Tool/Skill policy 或 output schema 覆盖；这些字段必须来自服务端读取的 AgentProfile 与受控默认值。catalog/detail 均为只读且不包含凭据。repository 同时实现共享 `AgentVersionResolver.resolvePublishedVersion(profileId, versionId)`，供 SOP 发布校验与后续 Runtime 依赖解析使用。

运行时不重新读取当前 AgentProfile。进入任务 8.3 时，BFF 按 Workflow IR 中的固定 identity 解析版本快照，通过向后兼容的可信内部 start dependency 字段交给 WorkflowRuntimePort；Mastra Adapter 校验 `agentProfileId + agentVersionId + contentHash` 后再构造 `AgentRuntimePort` command。该传输副本不是第二个持久化权威源，恢复仍使用同一不可变版本 identity 与 Mastra snapshot。

执行时：

1. 预分配确定性 `childAgentRunId`，由 parent run、node instance 和 attempt 派生。
2. 从可信 Workflow request context 派生 `resourceId/ownerId`。
3. 使用独立 `sessionId/threadId`，默认不与用户对话或其他节点共享 Memory。
4. 调用 `AgentRuntimePort.stream({ runId: childAgentRunId, ... })`，消费规范化 AgentRuntimeEvent。
5. 将 text delta 映射为带 childRunId 的 Workflow node output delta；Tool 事件继续留在 Agent 事件域或映射为脱敏 node log。
6. 父 AbortSignal 触发时调用 `AgentRuntimePort.cancel(childAgentRunId)` 并等待终态。

允许的 Tool/Skill 来自发布 Agent profile/version；Workflow 客户端不得在运行命令中扩大白名单。Agent 输出按节点声明 schema 校验后写入 Workflow frame。

备选：Workflow compiler 直接获取 Mastra Agent 并调用 `generate()`。未采用，因为会绕过 AgentRuntimePort 的 run query、cancel、Tool/Memory 身份和产品事件契约。

### 10. Human Approval 使用 run-scoped interrupt + Mastra suspend

Human Approval executor 根据 `productRunId + nodeId + instanceId + attempt` 派生稳定 interruptId，并将已解析、脱敏的 displayFields、decisionSchema、deadline 和 timeoutPolicy 写入当前 Mastra suspended step payload。兼容字段 `approvalRequestId` 可以映射为同一 interruptId，但不得成为可独立查询或持久化的产品资源。

运行路径固定为：

```text
HumanApprovalExecutor
        |
        v
Mastra step suspend
        |
        v
run.waiting(runId + interruptId + redacted display/schema/deadline)
        |
        v
POST /api/workflow-runs/:runId/resume
        |
        v
WorkflowRuntimePort.resume -> same Mastra run snapshot
```

BFF 不创建审批请求，只从具体 Workflow run 的 snapshot 或 waiting 投影验证 `runId + interruptId`，校验当前调用者的运行访问权限和请求 shape，然后作为薄代理调用 Agent Runtime。测试模式中的已认证用户只是在当前 SOP run 中模拟 approve/reject，不建立审批人、组织或待办分配模型。

`WorkflowRuntimePort.resume` 使用通用 interrupt command：interruptId、action、decision data 和 idempotencyKey。Adapter 通过 product/native run mapping 定位同一 Mastra snapshot，从真实 suspended step payload 校验 interrupt kind、node/instance identity、deadline 与 decisionSchema，再恢复对应 step。approve/reject 由 Human Approval executor 输出到已配置的 approved/rejected 端口；无效 schema 不得恢复 run。

若重复相同 idempotencyKey 和相同决定，需要返回首次结果，可在 Workflow run 技术存储中保存最小 decision receipt：`interruptId + idempotencyKey + decisionHash + result identity + expiresAt`。该 receipt 不保存 pending/approved/rejected 业务状态，不形成独立 repository，并在运行终态 retention 或 TTL 到期后清理。冲突决定返回稳定 conflict；resume、cancel、timeout 的竞态以 per-run 原子控制和 Mastra snapshot 的最终状态收敛，不建立第二套审批状态机。

公共产品层不提供 `/api/approvals`、`/internal/approvals`、审批列表、详情、筛选或历史管理。当前 SOP 测试运行面板只在正在观察的 run waiting 时渲染卡片；离开该 run 后不产生全局待办。当前尚未实现 Agent 对 Workflow 引用，因此本 change 不在聊天界面伪造审批流程；未来对话触发 Workflow 后复用同一 waiting 投影。

备选：保留 ApprovalControlPort、BFF Approval Repository 和 token/hash 链路。未采用，因为它把 interrupt 建模为独立审批实体并与 Mastra snapshot 重复维护状态。

备选：把 Mastra suspend payload 和 snapshot 直接暴露给 Web。未采用，因为会泄漏 Runtime 内部协议；产品层只公开最小 waiting 投影和通用 run-scoped resume。

### 11. Mastra snapshot 是执行状态唯一权威源

不新增自研 checkpoint 或审批 state machine。Orbit 允许持久化的运行索引只包含：

```text
productRunId
nativeRunId
snapshotLocator/version or updatedAt
event cursor
active interrupt receipt?
expiresAt
```

恢复流程通过 mapping 定位 Mastra snapshot；waiting、已成功 step/instance、输出和终态均由 Mastra snapshot 决定。产品 repository 只索引 run、父子 identity、事件游标和短期恢复幂等 receipt，不复制 step graph、审批状态或内部 snapshot JSON。waiting 状态至少保留到 deadline 与合法恢复窗口；终态技术状态在 retention 或 TTL 后按 run 清理。

备选：在 BFF 建 checkpoints 表复制每个变量和节点状态。未采用，因为会产生两个执行权威源，并增加重启后不一致风险。

### 12. 事件协议采用可选执行路径字段保持兼容

现有 WorkflowRuntimeEvent envelope 保持：`id/runId/at/type`。为 node status/log/output 和 run.waiting 增加可选字段：

```text
containerId
instanceId
iterationIndex
executionPath
childRunId
waiting.kind
waiting.interruptId
waiting.approvalRequestId
waiting.deadline
waiting.displayFields
waiting.decisionSchema
```

必要时增加 `node.instance.status` 和 `run.child` 事件成员；BFF decoder SHALL 跳过未知事件并继续处理已知 run/node/terminal 事件。Orbit Event Journal 继续分配产品 event id，不能使用 Mastra step key 作为重连游标。

备选：将每个 Iteration instance 伪装成顶层 nodeId。未采用，因为会破坏草稿节点身份和 Web 节点映射。

### 13. 阶段 E 使用能力开关而不是 Runtime backend 开关

生产 Runtime 已唯一为 Mastra，不再恢复 backend selector。阶段 E 节点是否允许发布由 capability registry 控制：

```text
parallelMerge
iteration
boundedLoop
nestedWorkflow
agentNode
humanApproval
restartResume
```

只有单项 contract、故障注入和性能门槛全部通过后才将对应 capability 标记为 true。包含未开放节点的草稿可以保存，但不能发布或生产运行。

备选：为高级 Workflow 恢复 Legacy backend。未采用，因为 Legacy 已删除，且会重新引入双 Runtime 和数据分叉。

### 14. 阶段 E 按单项门槛发布，不使用整体总开关

既有门槛结果表明，`parallelMerge` 的失败来自 Mastra foreach 对活动 sibling 的原生取消限制，而 Iteration、Loop、Nested Workflow、Agent、Human Approval 和 restart/resume 不依赖该缺失语义。Human Approval 已完成 run-scoped interrupt 修正与重新验收；这不改变 Parallel 的关闭结论。

生产候选默认矩阵固定为：

```text
parallelMerge = false
iteration = true
boundedLoop = true
nestedWorkflow = true
agentNode = true
humanApproval = true
restartResume = true
```

`DEFAULT_WORKFLOW_STAGE_E_CAPABILITIES` 是 BFF 发布门和 Agent 启动门共用的唯一默认矩阵。调用方仍可通过显式局部配置进一步关闭能力，用于回滚和测试；不得通过局部配置在生产中打开默认为 false 的 `parallelMerge`。Human Approval 同时依赖 `humanApproval` 与 `restartResume`，任一关闭都必须拒绝发布和启动。

2026-07-30 使用 npm 最新稳定版 `@mastra/core@1.55.0` 对相同 foreach fail-fast 场景进行隔离复测，结果仍为活动项 `[0, 1]` 已启动且 `aborted = []`。因此本 change 不升级 Mastra，不修改 Parallel 产品语义，也不增加 sibling scheduler；只调整无依赖 capability 的发布策略。

备选：继续等待所有七项同时通过。未采用，因为这会把无依赖能力的交付无限期绑定到 `parallelMerge`，无法体现 capability registry 的真实边界。

备选：升级到 1.55.0。未采用，因为实测缺失语义未修复，升级只会扩大回归面而不解除门槛。

## Risks / Trade-offs

- [Mastra foreach fail-fast 可能无法及时取消所有活动分支] → 建立真实 AbortSignal 与慢分支故障注入门槛；失败则保持 Parallel capability 关闭，不增加 Promise scheduler。
- [Loop condition 与 snapshot 重放可能产生 off-by-one] → iteration count 进入持久 frame，测试 0/1/max/max+1 边界及重启恢复。
- [嵌套 Workflow 逻辑 childRunId 不是独立 native run] → 明确首轮查询和取消随父运行；事件携带 executionPath，未来可升级映射而不改节点契约。
- [Agent 子运行跨 Port 带来取消竞态] → 预分配 childAgentRunId，父取消总是调用 Port cancel，并以查询到的终态收敛。
- [waiting 投影泄漏运行内部状态] → 只公开 interrupt identity、脱敏 displayFields、decisionSchema 和 deadline，禁止 token、hash、checkpoint、snapshot 和 native step graph。
- [resume、取消与超时同时提交] → 对同一 run 串行化控制命令，以 Mastra snapshot 的 waiting/terminal 状态作为唯一最终权威；幂等 receipt 只保存最小 decision hash 且带 TTL。
- [终态清理过早影响重连或调试] → active/waiting retention 覆盖 deadline，terminal retention 提供短期诊断窗口，并通过 run-scoped cleanup 测试验证。
- [动态 Iteration/Loop 放大事件与存储] → item/iteration、output、event 都有硬限制；默认只持久化声明输出与必要实例状态。
- [新增节点导致旧 Web 无法编辑] → UnknownWorkflowNode 无损保留；生产发布要求当前 registry capability 完整。
- [IR v2 影响 P0 编译] → 保留 P0 regression fixtures，IR v1 不作为长期运行格式；已发布版本在首次运行时按 adapterVersion 可重建 IR v2。

## Migration Plan

### Phase 0：契约与失败基线

1. 固化当前阶段 E capability gate 为失败测试。
2. 扩展 workflow-core 节点、子图、IR v2、变量和资源预算契约。
3. 迁移器保持 P0 文档不变，新节点按 node version 读取。

### Phase 1：Parallel/Merge 与 Iteration

1. 实现 Parallel 图分析和 prepare/foreach/dispatcher/merge compiler。
2. 实现统一 WorkflowSubgraph 编译和 Iteration foreach。
3. 验证并发上限 10、失败策略、事件实例身份、取消和输出体积。

### Phase 2：Loop 与 Subworkflow

1. 实现 Loop frame、condition、guard 和硬限制。
2. 实现不可变 Subworkflow dependency graph、递归/深度校验和 nested compile。
3. 验证重启恢复、错误链、版本固定和父子事件。

### Phase 3：Agent 与 Human Approval

1. 先完成不可变 AgentVersion repository、发布/catalog API、共享 resolver 与 Agent inspector。
2. 实现 AgentRuntimePort child run executor、可信版本快照传递和取消链。
3. 实现 Human Approval Mastra suspend payload、`run.waiting` 投影和绑定 Workflow run 的 BFF resume API；删除 Approval 产品 repository、表、内部控制面和独立 Web inbox。
4. 在当前 SOP 测试 run 面板实现临时 waiting 卡片，并验证 approve、reject、schema、幂等、取消/超时、重连、重启、TTL 和非幂等节点不重放。

### Phase 4：综合门禁与验收

1. 执行 Agent/Workflow 10 并发、持续 SSE、断线重连和长时间 waiting/resume。
2. 执行 crash/restart、storage 暂时不可用、重复决定、乱序事件和取消竞态故障注入。
3. 全部门槛通过后更新 `migrate-agent-runtime-to-mastra` 的阶段 E capability report 与 14.1–14.7 状态。
4. 发起独立用户验收；不自动修改 PRD-115 tasks，不自动 commit 或 push。

### Rollback

- capability 尚未开放时，rollback 只需保持对应节点不可发布；已开放单项可通过显式矩阵独立关闭。
- capability 开放后若发现问题，停止包含该节点的新发布和新运行；已运行实例继续查询、取消或按 snapshot 排空。
- 已发布 WorkflowVersion 不修改，修复后以新版本重新发布。
- 不恢复 Legacy Runtime，不从归档加载旧 scheduler，也不将高级节点 fallback 到自研执行器。

## Open Questions

- child Subworkflow 是否需要未来成为可独立查询/取消的 native run，留待阶段 F/G 的运维需求决定；本 change 首轮使用逻辑 child run。
- Agent 对 Workflow 调用链具备后，聊天界面如何复用 `run.waiting` 渲染上下文审批卡片，留待阶段 F 设计；不得重新引入独立审批收件箱。

## 锁定版本能力 Spike 结论（2026-07-28）

以下结论由 `apps/agent-cli/test/unit/mastra/workflows/stage-e-native-spike.test.ts` 在 `@mastra/core@1.52.1` 上实测，并由现有 WorkflowRuntimePort 恢复回归共同验证：

1. `.foreach()` 的静态 concurrency 与 per-run resolver 在两个并发 run 中分别保持各自上限；从 suspended snapshot resume 时 resolver 使用原始 initData 重新求值，未观察到共享 options 竞态。因此任务 1.3 通过。
2. `.foreach()` 在某项失败后会停止启动等待项，但不会向已经活动的 sibling 自动传播 AbortSignal。慢 sibling 会继续执行到自身结束，父 foreach 才收敛 failed。因此任务 1.4 的能力结论为不满足 Parallel fail-fast 活动分支取消门槛，`parallelMerge` capability 必须保持关闭；不得增加 Promise semaphore 或 Adapter 内 sibling scheduler 兜底。
3. committed nested Workflow 可作为 foreach、branch、dowhile 的 step；stream 中保留 nested workflow identity，内部错误向父结果传播为 failed；nested workflow 的 suspended snapshot 可在进程重建后通过同一 runId 和 nested step path 恢复，已成功的 child step 不重放。因此任务 1.5 通过。
4. `.dowhile()`/`.dountil()` 的 condition 在每次已完成 body 后调用，`iterationCount` 从 1 严格递增；取消活动 body 后原生结果为 `canceled`，不会调用下一次 condition；持久 snapshot 恢复后已完成 condition 不重复且 count 不回退。原生 do-loop 必定至少执行一次，因此产品 `while`/`until` 的零次执行语义必须由 Mastra 原生 `.branch()` 前置条件守卫后再进入 `.dowhile()`/`.dountil()`，不得在单 step 内实现 JavaScript while。任务 1.6 通过并带此编译约束。
5. suspend result 的 payload 以 step id 为 key；合法 resume 可跨进程恢复同一 snapshot，终态重复 resume 被 Mastra 拒绝，已成功非幂等前置 step 不重放。产品层仍必须提供 run-scoped idempotency key、decision receipt 和稳定 conflict，不能依赖 Mastra 原始错误作为公共幂等协议，也不得为此建立独立 Approval 状态机。因此任务 1.7 通过。

在阶段 E compiler、产品事件、run-scoped interrupt 恢复和综合故障门槛完成前，全部阶段 E capability 继续默认关闭；其中 Parallel 的 `fail-fast` 语义存在锁定版本硬阻塞，后续只能通过升级并重新 spike Mastra，或调整独立 OpenSpec 需求后再开放。

## 阶段 E Capability Report（2026-07-31）

### 综合运行指标

- 锁定 Runtime：`@mastra/core@1.52.1`，生产执行路径唯一为 Mastra，未引入 Legacy fallback、独立 scheduler、通用队列或 snapshot engine。
- 高级 Workflow release window：连续 3 轮，每轮并发 10 个运行，共 30 个运行全部成功；覆盖 Parallel、Iteration、Loop、Subworkflow 和 Agent 节点。
- 产品事件：30 个高级运行共记录 912 个事件；单 run event id 严格递增，`sinceId` 只回放游标之后的事件，慢消费者与订阅断开不改变 backend 状态。
- 性能基线：2026-07-30 最终专项回归的最大单轮耗时为 121.6 ms，低于 10 秒门槛；同轮 P0 最大单轮耗时为 101.5 ms。
- Human Approval 专项：Agent 55 个、BFF 13 个、Web 21 个测试通过，覆盖 approve、reject、decision schema、幂等、冲突、超时、取消、SSE 重连、Agent 重启恢复、非幂等节点不重放和 TTL 清理。
- 单项发布回归：Agent release gate 131 个文件、526 个测试通过；workflow-core 44 个、runtime-contracts 5 个、BFF 52 个、Web 88 个测试通过；Workflow smoke 13 个文件、84 个测试通过，workspace build 与全部 smoke 通过。
- 默认矩阵回归：BFF 使用共享默认矩阵允许已验证节点发布并拒绝 `parallelMerge`；Agent 使用同一矩阵真实运行 Iteration，并在编译前拒绝 Parallel/Merge。
- 浏览器验收：Agent 管理、Skill Hub、全局导航与聊天均无审批收件箱或伪造审批；Human Approval Inspector 保留完整设计态配置，当前 SOP run 的 waiting 卡片可在同一 run 上完成 approve/reject，离开该 run 后卡片消失，health 为 `mastra-only`。
- 浏览器 approve 首次发现 compiler 只将 Condition 视为路由节点，导致 Human Approval 恢复后同时执行 approved/rejected 后继。compiler 已将 `condition` 与 `human-approval` 统一收口为 router，并增加“只执行决定对应输出分支”的先失败回归测试；修复后 approve 仅执行 `approved-end`，reject 仅执行 `rejected-end`。

### 单项能力结论

| Capability | 结论 | 证据与限制 | 生产处置 |
| --- | --- | --- | --- |
| `parallelMerge` | 失败 | 静态分支通过受限 `.foreach()` 将并发限制在 10，ordered/by-branch 聚合与父取消通过；1.52.1 与最新稳定 1.55.0 在分支 fail-fast 时都只停止等待项，不会取消已经活动的 sibling。 | 保持 `false`；只允许未来 Mastra 版本重新 spike，或由独立 OpenSpec 调整产品语义。 |
| `iteration` | 通过 | 数组输入上限 1000、并发 1–10、稳定 instance/index、三种失败策略、输出聚合、取消、事件回放和恢复测试通过。 | 生产候选默认设为 `true`。 |
| `boundedLoop` | 通过 | 零次前置守卫、`.dowhile()`/`.dountil()`、最大 1000 次、最长 24 小时、结构化 limit error、取消和恢复计数不回退测试通过。 | 生产候选默认设为 `true`。 |
| `nestedWorkflow` | 通过 | 固定版本、最大深度 5、稳定 childRunId/executionPath、错误传播、父取消、跨进程恢复和非幂等 child step 不重放测试通过。 | 生产候选默认设为 `true`。 |
| `agentNode` | 通过 | 固定 AgentVersion、可信 owner/resource、隔离 thread/Memory、关闭式 Tool/Skill policy、AgentRuntimePort stream/cancel、输出 schema 和重启不重放测试通过。 | 生产候选默认设为 `true`。 |
| `humanApproval` | 通过 | ApprovalControlPort、Repository、产品表、内部控制面和全局收件箱均已删除；Human Approval 直接使用同一 Mastra run 的 suspend/waiting/resume，waiting 卡片仅存在于当前 SOP run。approve、reject、schema、幂等、冲突、超时、取消、重连和 TTL 测试与浏览器验收通过。 | 生产候选默认设为 `true`。 |
| `restartResume` | 通过 | Loop、Subworkflow、Agent child run 与 Human Approval 均已通过跨进程恢复；Mastra snapshot 是 waiting/terminal 和已成功 step 的唯一执行状态权威，已成功非幂等节点不重放。run mapping、事件和最小 decision receipt 均为 run-scoped 技术状态并具有 retention/TTL。 | 生产候选默认设为 `true`。 |

### 验证命令

```bash
pnpm --filter agent-cli exec vitest run test/smoke/mastra-only-release-window.test.ts --no-cache
pnpm --filter agent-cli exec vitest run test/smoke/mastra-only-release-window.test.ts test/unit/mastra/adapters/workflow-runtime-adapter.test.ts test/smoke/nest-host-compatibility.test.ts --no-cache
pnpm --filter agent-cli exec vitest run test/unit/mastra/adapters/workflow-runtime-adapter.test.ts test/unit/workflows/executors/human-approval.test.ts --no-cache
pnpm --filter agent-bff exec vitest run test/unit/workflow-runs test/smoke/workflow-runs-api.test.ts --no-cache
pnpm --dir apps/agent-cli lint
pnpm --filter agent-cli build
pnpm release:check
pnpm --filter @orbit/workflow-core test
pnpm --filter @orbit/runtime-contracts test
pnpm --filter agent-bff test
pnpm --filter agent-web-console test
```

### 发布判断

阶段 E 不再使用整体总开关。`parallelMerge` 因锁定版本及最新稳定版本均存在原生取消语义硬阻塞而继续关闭；Iteration、Loop、Nested Workflow、Agent、Human Approval 和 restart/resume 均已通过各自门槛。共享生产候选默认矩阵固定为 `parallelMerge = false`，其余六项为 `true`；不修改 PRD-115。
