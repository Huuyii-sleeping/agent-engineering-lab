## 1. 上位产品基线

- [x] 1.1 在 proposal 中固定 All-in-One Agent Workbench、统一 Mastra Runtime、Workflow 内部编排和非 BPM/非审批平台定位
- [x] 1.2 在 design 中定义产品配置、run-scoped 技术状态、用户业务状态、Mastra snapshot 权威源和 TTL/清理决策
- [x] 1.3 在 `all-in-one-agent-workbench` spec 中形成可验收的 UI、API、Human Approval、Runtime Port 和 Legacy 禁止项

## 2. Stage E 对齐

- [x] 2.1 更新 `enable-mastra-workflow-stage-e/proposal.md`，引用上位基线并删除独立 Approval 产品含义
- [x] 2.2 更新 `enable-mastra-workflow-stage-e/design.md`，将 Human Approval 收口为 run-scoped interrupt 和 Mastra snapshot 唯一权威源
- [x] 2.3 更新 `workflow-stage-e-approval-recovery` spec，补齐 SOP 当前 run 卡片、run-scoped resume、幂等、重连、重启和 TTL 验收
- [x] 2.4 更新 Stage E `tasks.md` 与 capability report，拆解删除 Approval 产品控制面、实现当前 run 卡片和完整回归的代码任务

## 3. 文档验证与实现交接

- [x] 3.1 校验本 change 和 `enable-mastra-workflow-stage-e`，确认 proposal、design、spec、tasks 一致且 apply-ready
- [x] 3.2 确认 PRD-115 artifacts 零修改、Legacy Runtime 未恢复、parallelMerge 结论未改变
- [x] 3.3 将已校验的 Stage E `tasks.md` 作为后续代码实现、测试、调试和浏览器运行的唯一执行输入
