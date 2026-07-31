## Why

Mastra 迁移已经把 Agent 运行路径收敛到统一 Runtime，但仓库尚缺少一份长期上位产品规范来约束 Agent、Workflow、Skill Hub、Memory 与 Human Approval 的边界。现在需要先明确平台只是一体化 Agent Workbench，避免 Workflow 和 Human Approval 演变为 BPM、待办或审批管理产品，并为后续 change 提供统一判定基线。

## What Changes

### In Scope

- 定义 All-in-One Agent Workbench 的长期产品定位：通过统一 Mastra Runtime 和不同的 instructions、model、Tools、Skills、Memory policy、Workflow、output schema 与 runtime policy 配置 Agent。
- 区分产品配置、运行技术状态和用户业务状态；允许前两类受控持久化，禁止平台拥有第三类状态。
- 明确 Workflow 只是 Agent 的内部编排、测试和运行配置能力，不是独立业务流程平台。
- 明确 Human Approval 只是具体 Workflow run 上的 runtime interrupt；保留设计态节点配置和当前运行宿主中的临时交互，不建立审批产品实体或全局控制面。
- 规定 `run.waiting`、run-scoped resume、Mastra snapshot 唯一权威源、SSE 重连、幂等、TTL 与终态清理边界。
- 规定全局导航、Agent 管理、Skill Hub、配置页和公共 API 不得出现审批收件箱、审批列表、详情、历史或脱离 `runId` 的操作入口。
- 规定 Legacy Runtime 永不恢复，后续 Agent、Workflow、Skill Hub、Memory 和 Runtime change 必须遵守本规范。

### Out of Scope

- 不修改 `openspec/changes/prd-115-production-sop-workflow-platform/` 的 proposal、design、specs 或 tasks。
- 不在本 change 中实现具体 Human Approval 代码；实现由同步修正后的 `enable-mastra-workflow-stage-e/tasks.md` 驱动。
- 不建设 BPM、用户任务中心、审批管理、组织权限、跨运行业务状态或流程运营后台。
- 不新增第二套 scheduler、snapshot engine、审批状态机或 Runtime backend。
- 不恢复或引用 `archive/legacy-agent-runtime/`。
- 不在 Agent 尚未具备 Workflow 对话调用链时伪造聊天审批界面。

## Capabilities

### New Capabilities

- `all-in-one-agent-workbench`: 定义统一 Mastra Runtime 上的一体化 Agent 配置、测试、运行和发布产品边界，以及 Workflow、Human Approval、运行状态、API、UI、TTL 和 Legacy Runtime 的长期约束。

### Modified Capabilities

<!-- 本 change 建立上位产品基线，不直接修改现有 capability 的需求。当前阶段 E change 将单独引用并落实该边界。 -->

## Impact

- OpenSpec：新增长期上位 capability；完成并归档后落入 `openspec/specs/all-in-one-agent-workbench/spec.md`。
- Stage E：`enable-mastra-workflow-stage-e` 必须删除独立 Approval Repository、审批产品记录和后台审批控制面的设计含义，改为 run-scoped interrupt。
- Runtime：生产执行路径继续唯一为 Mastra；Mastra snapshot 是 waiting/resume 的执行状态唯一权威源。
- BFF/API：只允许绑定具体 Workflow run 的查询、事件、取消和恢复；不得提供独立 Approval 产品资源。
- Web：Human Approval 配置只位于 SOP Builder Inspector；交互卡片只位于当前 SOP 测试 run 的 waiting 上下文。
- Storage：产品配置可长期保存；运行技术状态必须 run-scoped 且有 TTL 或终态清理；不得复制 Mastra step graph 或 snapshot 形成第二套状态机。
