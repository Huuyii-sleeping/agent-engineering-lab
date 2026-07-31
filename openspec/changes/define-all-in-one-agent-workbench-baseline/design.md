## Context

项目已经从教学版自研 Agent Runtime 迁移到 Mastra-only 生产路径，并保留 Web、BFF、Skill Hub、SOP 画布、`workflow-core` 和 Runtime Port 产品协议。当前缺口不是新的执行内核，而是长期产品边界：阶段 E 的 Human Approval 曾被设计为独立 `ApprovalRequest`、Repository、SQLite 表和内部控制面，容易把 Workbench 推向审批、待办或 BPM 平台，并与 Mastra snapshot 形成第二套执行状态权威源。

本 change 建立上位规范，不直接实现功能。它约束后续 Agent、Workflow、Skill Hub、Memory 和 Runtime change，并作为 `enable-mastra-workflow-stage-e` 收口 Human Approval 的设计依据。PRD-115 artifacts 保持不变，Legacy Runtime 继续仅以冻结归档存在。

## Goals / Non-Goals

**Goals:**

- 将产品定位固定为统一 Mastra Runtime 上的一体化 Agent 配置、测试、运行和发布 Workbench。
- 明确产品配置、运行技术状态和用户业务状态的所有权边界。
- 保留 Workflow 高级编排和 Human Approval 测试能力，同时阻止其演化为独立流程或审批产品。
- 固定 Mastra snapshot 为 waiting/resume 的执行状态唯一权威源。
- 固定 run-scoped API、当前运行宿主 UI、幂等、恢复、TTL 和清理约束。
- 为后续 OpenSpec change 提供必须显式遵守的上位产品基线。

**Non-Goals:**

- 不设计 BPM、审批人、组织关系、待办分配、审批历史或跨运行流程状态。
- 不改变 PRD-115 artifacts，不恢复 Legacy Runtime。
- 不引入第二套 scheduler、snapshot engine、审批状态机或通用任务中心。
- 不规定 Mastra 的内部 snapshot 格式、step graph 或存储实现细节。
- 不在尚无 Agent→Workflow 对话调用链时设计聊天审批交互。

## Decisions

### 1. 产品核心是 Agent definition，不是业务流程实例

Agent 是平台主要产品对象，由 instructions、model、Tools、Skills、Memory policy、Workflow、output schema 和 runtime policy 的版本化组合定义。Workflow 是 Agent definition 的内部编排能力，可以独立测试，但不升级为平台级业务流程产品。

备选：把 Workflow 与 Agent 并列为业务流程平台。未采用，因为这会自然引入流程实例、用户任务、审批中心和组织权限，与项目目标不一致。

### 2. 使用三类状态边界判断持久化归属

允许长期保存的产品配置包括 AgentProfile、AgentVersion、WorkflowDraft、WorkflowVersion、Tool/Skill 绑定、Memory policy、发布元数据、版本和 contentHash。

允许短期保存的运行技术状态包括 runId/nativeRunId mapping、Mastra snapshot、`run.waiting`、SSE 游标、取消/恢复/幂等所需的最小 receipt、测试日志和必要事件。它们必须绑定具体 run，并具有 TTL 或终态清理策略。

平台不得拥有用户业务状态，包括全局审批待办、审批任务分配、组织关系、跨运行审批状态、独立 ApprovalRequest、脱离 run 的审批详情和业务流程实例管理。

备选：用“是否持久化”作为唯一判断标准。未采用，因为 Mastra durable snapshot 和重启恢复必然需要状态；正确边界是状态归属和权威来源，而不是完全无状态。

### 3. Mastra snapshot 是执行状态唯一权威源

Workflow waiting、已完成 step、恢复位置和后续分支由同一 Mastra run snapshot 决定。产品层只保存定位、查询、流式投影、权限和幂等所需的最小 run-scoped 技术数据，不复制内部 step graph、变量帧或 snapshot JSON 形成第二套状态机。

备选：BFF 保存 checkpoint、审批状态和恢复 token，Mastra 只负责执行。未采用，因为双写和重启竞态会产生两个权威源，无法可靠判断同一个 run 是否仍可恢复。

### 4. Human Approval 建模为通用 run-scoped interrupt

设计态 Human Approval 节点保留 displayFields、decisionSchema、approve/reject 分支、deadline、timeout 和 timeout policy。运行到该节点时，由 Mastra suspend 产生绑定 run、node/instance 和 attempt 的 interrupt identity；`approvalRequestId` 若为兼容保留，仅是 interruptId 的别名，不是独立资源主键。

决定命令必须恢复同一个 run，并同时携带 runId、interruptId、action、decision data 与 idempotencyKey。重复相同决定返回相同结果，冲突决定返回稳定冲突；最终 waiting/terminal 判断仍以 Mastra snapshot 为准。

备选：建立 Approval Repository 后再调用 Mastra resume。未采用，因为审批记录会演变为独立业务实体，并重复保存 pending/approved/rejected 状态。

### 5. UI 只在当前运行宿主展示 interrupt 卡片

Human Approval Inspector 只存在于 SOP Builder 节点配置。SOP 测试 run 真正进入 waiting 时，当前运行面板根据该 run snapshot 或 SSE 投影临时展示卡片；页面重连或在保留期内重新打开同一 run 时可重建。离开当前 run 后不生成全局待办。

将来 Agent 对话具备真实 Workflow 调用链后，可复用相同 `run.waiting` 契约；在此之前聊天页不伪造审批界面。

备选：隐藏全局审批入口但保留审批 feature/repository。未采用，因为隐藏入口不能消除产品模型和双状态权威源。

### 6. API 只提供 run-scoped 查询、事件、取消和恢复

公共接口使用 `/api/workflow-runs/:runId` 资源边界。恢复优先采用 `POST /api/workflow-runs/:runId/resume`，BFF 作为薄代理验证当前 waiting identity 后转发到 Agent Runtime，不持久化独立 Approval 实体。

禁止 `GET /api/approvals`、`GET /api/approvals/:id`、`POST /api/approvals/:id/decision` 和等价的全局审批资源。对外 waiting 投影不得包含 resume token、hash、checkpoint、Mastra snapshot、native step graph 或内部凭据。

备选：保留内部 `/internal/approvals` 作为安全控制面。未采用，因为 run-scoped resume 可以在 Runtime Port 和 run 技术存储内完成权限、幂等与恢复，无需建立 Approval 产品边界。

### 7. 运行技术数据采用 run retention policy

waiting 运行的保留期至少覆盖节点 deadline 和允许的恢复窗口；终态运行的 transient interrupt receipt、事件缓存和临时映射在配置的 retention 后清理。清理不得早于合法恢复窗口，也不得因删除 BFF 投影破坏 Mastra snapshot 的权威性。清理采用 run 维度，不按 approval 维度建立独立任务或 repository。

备选：无限保存所有测试运行和事件。未采用，因为它会把短期运行技术状态沉淀为长期业务历史，并增加敏感数据和存储风险。

### 8. Runtime Port 保持产品协议，Mastra Adapter 承担底层执行

Agent 与 Workflow 对话/运行继续分别通过稳定 Runtime Port 进入同一 Mastra Runtime 基座。`WorkflowRuntimePort.resume` 表达通用 interrupt 恢复，而不是审批产品命令；SSE envelope、取消和运行查询保持兼容。不得从任何生产装配引用 Legacy Runtime 归档。

备选：Human Approval 绕过 Runtime Port 直接操作 Mastra 内部 API。未采用，因为会让 BFF/Web 依赖框架内部协议并破坏产品层稳定边界。

### 9. 上位规范约束后续 change

后续 Agent、Workflow、Skill Hub、Memory 和 Runtime change 在 proposal/design/spec 中必须保持本 capability 的边界；若需求确实要建设用户业务状态平台，必须建立新的产品决策而不能在实现细节中渐进引入。

备选：只在 Stage E change 中修复一次。未采用，因为相同边界会在 Agent 对 Workflow、Memory、发布和运行历史能力中反复出现。

## Risks / Trade-offs

- [删除 Approval Repository 后幂等和竞态处理更靠近 run storage] → 只保存 run-scoped decision receipt，并以 Mastra snapshot 的 waiting/terminal 状态作最终校验。
- [终态清理可能影响调试和重连] → retention 分为 active/waiting 与 terminal 两类，等待窗口覆盖 deadline，终态保留必要的短期诊断期。
- [Mastra snapshot 内部格式随版本演进] → Runtime Adapter 封装 snapshot 访问，产品 DTO 不暴露内部结构。
- [未来外部真实审批需要人员和权限] → 只允许保存声明式 external approval policy reference；真正待办、组织与通知由外部系统拥有，平台仍通过 run-scoped interrupt 对接。
- [兼容字段 approvalRequestId 容易再次被误解为产品实体] → 契约中同时定义通用 interruptId，并明确该字段不可独立查询、列表或持久化为 Approval 产品记录。

## Migration Plan

1. 完成并校验本上位 OpenSpec，作为 Stage E 文档修正的引用基线。
2. 修改 `enable-mastra-workflow-stage-e` 的 proposal、design、approval recovery spec、tasks 和 capability report，删除独立审批产品设计。
3. 按 Stage E tasks 删除 Web/BFF/Runtime 的 Approval 产品控制面，迁移到 run-scoped resume 和技术状态。
4. 增加 SOP 当前 run waiting 卡片及 approve/reject/timeout/cancel/reconnect/restart/TTL 测试。
5. 完成全量构建、回归和浏览器验收；确认 Mastra-only、PRD-115 零修改和 Legacy 零活动引用后提交。
6. 验收本 change 后归档，使规范进入 `openspec/specs/all-in-one-agent-workbench/spec.md`。

回滚只允许回滚未通过验收的 UI/API 适配，不得恢复 Legacy Runtime、全局审批入口或独立 Approval Repository。若 run-scoped 恢复存在阻塞，应保持 Human Approval capability 关闭并继续修复。

## Open Questions

- 终态测试 run 的默认 retention 具体时长由实现 change 根据现有本地数据治理配置确定，但必须可配置、可测试且不短于必要的浏览器验收窗口。
- 外部 approval policy reference 的协议留待真实集成需求出现后单独设计，本 change 只保留产品边界，不预建组织或待办模型。
