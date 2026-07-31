## ADDED Requirements

### Requirement: All-in-One Agent Workbench 产品定位
系统 SHALL 作为基于统一 Mastra Runtime 的 All-in-One Agent Workbench，通过版本化的 instructions、model、Tools、Skills、Memory policy、Workflow、output schema 和 runtime policy 完成 Agent 的配置、测试、运行与发布。

#### Scenario: 通过配置形成不同 Agent
- **WHEN** 用户创建或发布具有不同 instructions、model、Tools、Skills、Memory policy 或 Workflow 的 Agent
- **THEN** 系统 SHALL 在同一 Mastra Runtime 基座上运行这些 Agent，而不是为每个 Agent 建立独立 Runtime 产品

#### Scenario: 平台边界审查
- **WHEN** 新 change 试图引入 BPM、用户任务中心、审批管理、待办管理或组织权限能力
- **THEN** 该 change SHALL 被视为超出 Workbench 基线，且不得作为 Agent 或 Workflow 的隐含实现细节进入生产路径

### Requirement: 产品配置允许版本化持久化
系统 SHALL 允许长期保存 AgentProfile、AgentVersion、instructions、Tool/Skill 绑定、Memory policy、WorkflowDraft、WorkflowVersion、发布元数据、版本和 contentHash 等产品配置。

#### Scenario: 发布不可变配置
- **WHEN** 用户发布 Agent 或 Workflow
- **THEN** 系统 SHALL 保存可重现运行所需的不可变配置 identity，而不依赖后续可变草稿

### Requirement: 运行技术状态必须绑定具体 run
系统 MAY 持久化 runId、nativeRunId、Mastra snapshot、`run.waiting`、SSE 游标、取消/恢复/幂等信息、当前测试日志和必要 runtime mapping，但所有此类状态 SHALL 绑定具体 Workflow run，并具有 TTL 或终态清理策略。

#### Scenario: 等待中的运行需要恢复
- **WHEN** Workflow run 因 runtime interrupt 进入 waiting
- **THEN** 系统 SHALL 保留覆盖 deadline 和合法恢复窗口所需的 run-scoped 技术状态

#### Scenario: 运行结束或保留期到期
- **WHEN** Workflow run 已进入终态且达到 retention，或运行技术状态 TTL 到期
- **THEN** 系统 SHALL 清理临时 interrupt receipt、事件缓存和必要 mapping，且不得留下独立业务待办

### Requirement: 平台不得拥有用户业务状态
系统 SHALL NOT 持有全局审批待办、审批任务分配、审批人组织关系、跨运行审批状态、独立 ApprovalRequest 产品实体、脱离 Workflow run 的审批详情或用户业务流程实例管理状态。

#### Scenario: 审批信息无法脱离 run 使用
- **WHEN** 客户端仅持有 interruptId 或兼容 approvalRequestId 而没有对应 runId
- **THEN** 系统 SHALL NOT 提供查询、详情或决定操作

### Requirement: Workflow 是 Agent 内部编排能力
Workflow SHALL 用于 Agent 的节点配置、连接、条件、容器控制流、Agent 节点、Human Approval 节点、测试运行和结果观察，不得扩展为独立业务流程运营平台。

#### Scenario: SOP Builder 配置高级节点
- **WHEN** 用户在 SOP Builder 配置 Human Approval、Iteration、Loop、Subworkflow 或 Agent 节点
- **THEN** 系统 SHALL 将其作为 Agent Workflow 的设计态和测试态能力处理

#### Scenario: 不创建用户任务中心
- **WHEN** Workflow run 进入 waiting
- **THEN** 系统 SHALL 只在当前运行上下文表达 interrupt，不得创建平台级用户待办

### Requirement: Human Approval 是 run-scoped runtime interrupt
Human Approval SHALL 保留 displayFields、decisionSchema、approve/reject 分支、deadline、timeout 和 timeout policy 等设计态配置；运行时 SHALL 由同一 Mastra run 的 suspend/waiting/resume 表达，不得建模为独立审批产品。

#### Scenario: 运行到 Human Approval
- **WHEN** Workflow run 执行到 Human Approval 节点
- **THEN** Mastra run SHALL 进入 waiting，并产生绑定 run、node/instance 和 attempt 的 interrupt identity

#### Scenario: 提交同意或拒绝
- **WHEN** 当前运行宿主提交合法的 approve 或 reject 决定
- **THEN** 系统 SHALL 恢复同一个 Mastra run，并进入节点配置的对应执行分支

#### Scenario: 决策表单不合法
- **WHEN** decision data 不符合当前 waiting 的 decisionSchema
- **THEN** 系统 SHALL 拒绝恢复命令，且该 Mastra run SHALL 保持 waiting

### Requirement: SOP 测试运行必须真实验证 Human Approval
SOP 测试运行 SHALL 覆盖 approve、reject、schema 校验、重复提交、冲突决定、超时、取消、页面重连、保留期内重新打开、必要的进程重启恢复和已完成非幂等节点不重放。

#### Scenario: 重连当前 waiting run
- **WHEN** 浏览器在 waiting 后断开并使用同一 runId 重连 snapshot 或 SSE
- **THEN** 当前 SOP 运行面板 SHALL 从同一 `run.waiting` 重建临时审批卡片

#### Scenario: 重复提交相同决定
- **WHEN** 客户端使用相同 idempotencyKey 重复提交相同决定
- **THEN** 系统 SHALL 返回与首次提交一致的结果且不得二次恢复或重放已完成节点

#### Scenario: 冲突决定
- **WHEN** 同一 interrupt 收到不同 action 或不同 decision data 的重复决定
- **THEN** 系统 SHALL 返回稳定冲突且不得改变已确定的运行结果

#### Scenario: 超时或取消
- **WHEN** waiting 超过 deadline 或当前 run 被取消
- **THEN** 同一 Mastra run SHALL 按 timeout policy 或取消语义稳定收敛到唯一结果

### Requirement: Human Approval UI 只存在于当前 run 上下文
Human Approval 节点配置 SHALL 只出现在 SOP Builder 对应节点 Inspector；交互卡片 SHALL 只在当前 SOP 测试 run 真正 waiting 时显示。Agent 管理、Skill Hub、配置页和全局导航 SHALL NOT 提供审批收件箱、审批列表、详情、筛选或历史页面。

#### Scenario: 当前 run 显示临时卡片
- **WHEN** 当前 SOP 测试 run 的 snapshot 或 SSE 包含 `run.waiting`
- **THEN** 当前运行面板 SHALL 展示脱敏 displayFields、decisionSchema、deadline 和 approve/reject 操作

#### Scenario: 离开当前 run
- **WHEN** 用户关闭或切换离开该 run 上下文
- **THEN** 系统 SHALL NOT 在其他页面生成全局审批待办或入口

#### Scenario: 对话尚未接入 Workflow
- **WHEN** Agent→Workflow 对话调用链尚未实现
- **THEN** 聊天页面 SHALL NOT 伪造 Human Approval 卡片

### Requirement: Approval API 必须绑定 Workflow run
Human Approval 的决定命令 SHALL 通过具体 Workflow run 的恢复接口提交，并携带 runId、interruptId 或兼容 approvalRequestId、action、decision data 和 idempotencyKey。系统 SHALL NOT 暴露独立 Approval 产品资源。

#### Scenario: Run-scoped resume
- **WHEN** 客户端调用 `POST /api/workflow-runs/:runId/resume` 并提交与当前 waiting 匹配的 interrupt identity
- **THEN** BFF SHALL 作为薄代理验证并恢复对应的同一个 Workflow run

#### Scenario: 禁止独立审批接口
- **WHEN** 客户端请求 `GET /api/approvals`、`GET /api/approvals/:id` 或 `POST /api/approvals/:id/decision`
- **THEN** 系统 SHALL NOT 提供这些路由或等价的全局审批资源

### Requirement: Run waiting 投影必须最小且脱敏
`run.waiting` MAY 公开 interruptId、兼容 approvalRequestId、deadline、脱敏 displayFields 和 decisionSchema，但 SHALL NOT 公开 resume token 明文、token hash、checkpoint、Mastra snapshot、native step graph 或内部凭据。

#### Scenario: 当前运行宿主读取 waiting
- **WHEN** Web 通过具体 run snapshot 或 SSE 收到 `run.waiting`
- **THEN** payload SHALL 足以渲染当前运行卡片，同时不包含 Runtime 内部恢复凭据和 snapshot 结构

### Requirement: Mastra snapshot 是执行状态唯一权威源
系统 SHALL 以 Mastra snapshot 判定 waiting、已完成 step、恢复位置、终态和后续分支。BFF 或产品 repository SHALL NOT 复制 Mastra 内部 step graph、变量帧或审批状态机形成第二套执行状态权威源。

#### Scenario: 进程重启后恢复
- **WHEN** Agent 服务重启后收到合法的 run-scoped resume
- **THEN** Runtime Adapter SHALL 从持久 Mastra snapshot 定位并恢复同一 suspended step

#### Scenario: BFF 只保存技术索引
- **WHEN** 权限、幂等或一次性恢复需要额外持久化
- **THEN** 这些信息 SHALL 作为具有 TTL 的 run-scoped 技术状态保存，不得形成 Approval Repository 产品模型

### Requirement: Runtime 产品协议保持稳定
Agent 与 Workflow 调用 SHALL 通过稳定 Runtime Port 进入统一 Mastra Runtime；WorkflowRuntimePort SHALL 继续支持 start、get、cancel、events 和通用 interrupt resume，并保持 `/workflow-runs` 与 SSE envelope 的兼容性。

#### Scenario: 恢复 Human Approval
- **WHEN** BFF 提交通用 interrupt resume command
- **THEN** Mastra Adapter SHALL 调用底层 Mastra run 恢复能力，且上层不得依赖 Mastra 内部 DSL 或 snapshot 格式

### Requirement: Legacy Runtime 永不恢复
生产 Agent、NestJS、Runtime Gateway、Mastra Adapter、workspace、tsconfig、exports、构建和测试 SHALL NOT 引用 `archive/legacy-agent-runtime/` 或恢复 Legacy Runtime backend。

#### Scenario: 生产健康检查
- **WHEN** 查询生产 Runtime health 或执行发布门验证
- **THEN** 系统 SHALL 报告并使用唯一的 `mastra-only` 生产路径

#### Scenario: 历史归档存在
- **WHEN** 仓库保留 `archive/legacy-agent-runtime/`
- **THEN** 该目录 SHALL 继续保持 frozen、read-only、non-production，且不参与任何活动代码路径

### Requirement: 后续 change 必须遵守上位基线
后续 Agent、Workflow、Skill Hub、Memory 和 Runtime change SHALL 在需求、设计和实现中遵守本 capability；任何平台拥有用户业务状态或第二套 Runtime 状态机的提案必须作为显式产品方向变更重新评审。

#### Scenario: 新增运行能力
- **WHEN** 后续 change 新增 Workflow trigger、Agent→Workflow、Memory 或运行历史能力
- **THEN** 其 OpenSpec SHALL 保持配置数据、run-scoped 技术状态和用户业务状态的边界，并继续使用统一 Mastra Runtime
