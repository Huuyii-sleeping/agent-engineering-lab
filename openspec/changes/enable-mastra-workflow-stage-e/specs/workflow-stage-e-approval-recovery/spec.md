## ADDED Requirements

### Requirement: Human Approval SHALL 保留完整设计态配置
Human Approval 节点 SHALL 保存提示内容、displayFields、decisionSchema、approve/reject 等执行分支、deadline、timeout 和 timeoutPolicy，并 SHALL 通过共享 Workflow contract、发布校验与 SOP Builder Inspector 编辑。

#### Scenario: 配置 Human Approval 节点
- **WHEN** 用户在 SOP Builder 选择 Human Approval 节点
- **THEN** Inspector SHALL 允许配置展示字段、结构化决定 schema、同意/拒绝分支和超时策略
- **AND** 配置 SHALL 进入不可变 WorkflowVersion 与 Workflow IR

### Requirement: Human Approval SHALL 由同一 Mastra run 的 interrupt 表达
Human Approval executor SHALL 使用 Mastra suspend 使当前 Workflow run 进入 waiting，并 SHALL 产生绑定 product run、native run、node/instance 和 attempt 的稳定 interruptId。兼容 approvalRequestId MAY 与 interruptId 相同，但 SHALL NOT 成为独立产品资源。

#### Scenario: Human Approval 进入 waiting
- **WHEN** Human Approval 节点完成输入解析和展示字段脱敏
- **THEN** 同一 Mastra run SHALL suspend 并输出 `run.waiting`
- **AND** waiting SHALL 包含 interruptId、兼容 approvalRequestId、deadline、脱敏 displayFields 和 decisionSchema

#### Scenario: Waiting 投影不泄漏内部状态
- **WHEN** Web 通过 run snapshot 或 SSE 获得 `run.waiting`
- **THEN** payload SHALL NOT 包含 resume token、token hash、checkpoint、Mastra snapshot、native step graph 或内部凭据

### Requirement: 审批决定 SHALL 绑定具体 Workflow run
公共决定入口 SHALL 使用 `POST /api/workflow-runs/:runId/resume` 或等价的 run-scoped 命令，并 SHALL 携带 interruptId 或兼容 approvalRequestId、action、decision data 和 idempotencyKey。BFF SHALL 验证该 interrupt 属于当前 run 后再调用 WorkflowRuntimePort.resume。

#### Scenario: 合法 approve
- **WHEN** 当前运行宿主向同一 run 提交符合 schema 的 approve 决定
- **THEN** Runtime SHALL 恢复同一个 Mastra run
- **AND** Human Approval 节点 SHALL 从 approved 输出端口继续执行

#### Scenario: 合法 reject
- **WHEN** 当前运行宿主向同一 run 提交符合 schema 的 reject 决定
- **THEN** Runtime SHALL 恢复同一个 Mastra run
- **AND** Human Approval 节点 SHALL 从 rejected 输出端口继续执行

#### Scenario: Run identity 冲突
- **WHEN** resume 命令中的 interruptId 不属于路径中的 runId
- **THEN** BFF 或 Runtime SHALL 返回稳定 conflict
- **AND** 两个 run 的 Mastra snapshot 均 SHALL NOT 被错误恢复

#### Scenario: 决策数据不符合 schema
- **WHEN** decision data 缺少必填字段或字段类型错误
- **THEN** Runtime SHALL 返回结构化校验错误
- **AND** 当前 Mastra run SHALL 保持 waiting

### Requirement: SOP 测试运行 SHALL 在当前 run 显示临时审批卡片
当前 SOP 测试运行面板 SHALL 只在正在观察的 run 真正进入 waiting 时，根据该 run 的 waiting 投影显示审批卡片。卡片 SHALL 展示脱敏 displayFields、deadline 和 decisionSchema 表单，并 SHALL 提供 approve/reject 操作。

#### Scenario: 当前测试 run 进入 waiting
- **WHEN** SOP 测试运行的 snapshot 或 SSE 输出 approval interrupt
- **THEN** 当前 SopRunPanel SHALL 显示该 run 的临时审批卡片
- **AND** 提交后 SHALL 继续观察同一个 run 的事件和终态

#### Scenario: 页面重连
- **WHEN** 浏览器在 waiting 后断线，并使用相同 runId 与 SSE 游标重连
- **THEN** 当前运行面板 SHALL 从 snapshot 或重放事件重建同一审批卡片

#### Scenario: 离开当前 run
- **WHEN** 用户关闭或切换离开该 SOP 测试 run
- **THEN** 平台 SHALL NOT 在全局导航、Agent 管理、Skill Hub、配置页或其他 run 中生成审批待办

#### Scenario: 对话尚未接入 Workflow
- **WHEN** Agent→Workflow 对话调用链尚未实现
- **THEN** 聊天页面 SHALL NOT 伪造 Human Approval 卡片

### Requirement: Resume SHALL 使用 run-scoped 幂等技术状态
Workflow Runtime SHALL 接受 idempotencyKey，并 MAY 在具体 run 的技术存储中保存最小 decision receipt，包括 interruptId、idempotencyKey、decisionHash、结果 identity 和 expiresAt。该 receipt SHALL NOT 保存独立审批业务状态，且 SHALL 在终态 retention 或 TTL 后清理。

#### Scenario: 网络重试重复 approve
- **WHEN** 客户端使用相同 idempotencyKey 和相同 decision 重复提交
- **THEN** 系统 SHALL 返回与首次提交一致的结果
- **AND** SHALL NOT 再次 resume 或重放已完成节点

#### Scenario: 相同键提交冲突决定
- **WHEN** 相同 idempotencyKey 已用于 approve 后又提交 reject 或不同 decision data
- **THEN** 系统 SHALL 返回稳定 conflict
- **AND** 首次运行结果 SHALL 保持不变

### Requirement: Mastra snapshot SHALL 是唯一执行状态权威源
Mastra storage SHALL 保存 Workflow snapshot，并 SHALL 决定 waiting、已完成 step、恢复位置、终态和后续分支。Orbit 产品层只 MAY 保存 run mapping、事件游标和具有 TTL 的恢复幂等 receipt，不得复制或解释 Mastra 内部 step graph、变量帧或 approval state。

#### Scenario: Agent Service 重启后恢复
- **WHEN** 服务在 Human Approval waiting 期间重启
- **THEN** Runtime SHALL 通过 product/native run mapping 定位同一 Mastra snapshot
- **AND** 合法决定 SHALL 恢复同一 native run 的 suspended step

#### Scenario: 已成功非幂等节点不重放
- **WHEN** 非幂等 Tool、HTTP、Code 或 Agent 节点已成功后 Workflow 在 Human Approval waiting，并经历进程重启
- **THEN** resume SHALL 从持久 snapshot 继续
- **AND** 已成功节点 SHALL NOT 再次执行

### Requirement: 取消、超时与 Resume SHALL 单一收敛
Workflow cancel、Human Approval resume 和 timeout SHALL 在同一 run 控制边界内竞争，并 SHALL 以 Mastra snapshot 的 waiting/terminal 状态作为最终权威。第一个合法操作生效，后续冲突操作 SHALL 返回稳定结果，不得形成第二套审批状态机。

#### Scenario: 取消与 approve 竞态
- **WHEN** cancel 与 approve 同时到达 waiting run
- **THEN** 只有一个操作 SHALL 推进该 run 到下一状态
- **AND** 事件流 SHALL NOT 同时出现互相矛盾的恢复和取消终态

#### Scenario: Human Approval 超时
- **WHEN** waiting 达到 deadline 且尚未被合法 resume 或 cancel
- **THEN** Runtime SHALL 按节点 timeoutPolicy 拒绝、失败或进入声明的 error route
- **AND** 后续决定 SHALL NOT 恢复已超时 run

### Requirement: 平台 SHALL NOT 建立独立 Approval 产品控制面
系统 SHALL NOT 定义 ApprovalRequest 产品实体、Approval Repository、审批业务表、审批人待办、组织关系、跨运行审批状态、内部 `/internal/approvals` 控制面或公共 Approval 资源。权限和幂等所需信息 SHALL 位于具体 run 的技术边界。

#### Scenario: 独立审批接口不存在
- **WHEN** 客户端请求 `GET /api/approvals`、`GET /api/approvals/:id` 或 `POST /api/approvals/:id/decision`
- **THEN** BFF SHALL 不提供这些路由或等价接口

#### Scenario: 数据库不包含 Approval 产品表
- **WHEN** BFF 初始化新数据库或升级现有未发布开发数据库
- **THEN** schema SHALL 不包含 `approval_requests` 或等价的独立审批业务表

#### Scenario: Runtime 不依赖 Approval 控制面
- **WHEN** Agent Service 启动或执行 Human Approval
- **THEN** Human Approval executor SHALL 直接使用 Mastra suspend/resume 和 run-scoped 技术状态
- **AND** SHALL NOT 调用 BFF ApprovalControlPort 或 Approval Repository

### Requirement: 运行技术状态 SHALL 具有 TTL 或终态清理
waiting run 的必要 snapshot 定位、事件、mapping 和 decision receipt SHALL 至少保留到 deadline 与合法恢复窗口；terminal run 的临时 interrupt 状态 SHALL 在配置的 retention 或 TTL 后按 run 清理。

#### Scenario: Waiting 保留期内重新打开
- **WHEN** 用户在 deadline 和 retention 内重新打开同一个 run
- **THEN** 系统 SHALL 能查询当前 waiting 投影并继续合法 resume

#### Scenario: 终态或 TTL 清理
- **WHEN** run 已终态且 retention 到期，或 transient 技术状态 TTL 到期
- **THEN** 系统 SHALL 清理 run-scoped interrupt receipt 和临时事件/映射
- **AND** 清理后 SHALL 不存在全局审批历史或待办记录

### Requirement: Human Approval SHALL 遵守 Mastra-only 生产路径
Human Approval、resume、取消、查询、SSE 和重启恢复 SHALL 通过 WorkflowRuntimePort 与 Mastra Adapter 执行，不得引用 Legacy Runtime、独立 scheduler 或自研 snapshot engine。

#### Scenario: 生产健康检查
- **WHEN** 执行 Runtime health、release gate 或 Stage E capability gate
- **THEN** 生产路径 SHALL 报告 `mastra-only`
- **AND** `archive/legacy-agent-runtime/` SHALL 无活动代码引用
