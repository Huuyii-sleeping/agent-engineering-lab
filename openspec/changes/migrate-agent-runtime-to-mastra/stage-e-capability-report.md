# 阶段 E Capability Report

## 结论

截至 2026-07-31，阶段 E 继续按 capability 独立验证。`iteration`、`boundedLoop`、`nestedWorkflow`、`agentNode`、`humanApproval` 和 `restartResume` 已通过各自门槛；`parallelMerge` 因 Mastra foreach fail-fast 无法取消已经活动的 sibling，继续保持关闭。Human Approval 已收口为同一 Mastra run 的 run-scoped interrupt，并已删除 ApprovalControlPort、Repository、数据库表、内部控制面和全局审批收件箱。

本结论不修改 PRD-115，不恢复 Legacy Runtime，不升级生产锁定的 `@mastra/core@1.52.1`，也不通过降低产品语义或在 Adapter 内增加 sibling scheduler、自研队列、fallback、snapshot engine 来绕过框架缺口。

生产候选默认矩阵为：

```ts
{
  parallelMerge: false,
  iteration: true,
  boundedLoop: true,
  nestedWorkflow: true,
  agentNode: true,
  humanApproval: true,
  restartResume: true,
}
```

BFF 发布门与 Agent 启动门共用该共享默认矩阵；调用方可以显式进一步关闭能力，但不得在生产局部配置中打开默认关闭的 `parallelMerge`。

## 能力矩阵

| OpenSpec 任务 | Capability | 结论 | 验证证据与限制 | 生产处置 |
| --- | --- | --- | --- | --- |
| 14.1 Parallel/Merge | `parallelMerge` | 失败 | 静态分支通过受限 `.foreach()` 将并发限制在 10，ordered/by-branch 聚合与父取消通过；锁定的 1.52.1 与隔离复测的最新稳定 1.55.0 都只停止等待项，不会取消已活动 sibling。1.55.0 复测结果为 `started = [0, 1]`、`aborted = []`。 | 保持 `false`；仅在未来 Mastra 版本重新 spike 通过，或由独立 OpenSpec 调整产品语义后再开放。 |
| 14.2 Iteration | `iteration` | 通过 | 数组输入上限 1000、并发 1–10、稳定 instance/index、fail-fast/continue/collect-errors、ordered/by-index 聚合、取消、事件回放和恢复测试通过。 | 默认设为 `true`，进入独立生产验收。 |
| 14.3 Loop | `boundedLoop` | 通过 | 零次前置守卫、`.dowhile()`/`.dountil()`、最大 1000 次、最长 24 小时、结构化 limit error、取消和恢复计数不回退测试通过。 | 默认设为 `true`，进入独立生产验收。 |
| 14.4 Nested Workflow | `nestedWorkflow` | 通过 | 固定不可变版本、最大深度 5、稳定 childRunId/executionPath、事件与错误传播、父取消、跨进程恢复和非幂等 child step 不重放测试通过。 | 默认设为 `true`，进入独立生产验收。 |
| 14.5 Agent 节点 | `agentNode` | 通过 | 固定 AgentVersion、可信 owner/resource、隔离 thread/Memory、关闭式 Tool/Skill policy、AgentRuntimePort stream/cancel、输出 schema 和重启不重放测试通过。 | 默认设为 `true`，进入独立生产验收。 |
| 14.6 Human Approval | `humanApproval` | 通过 | 同一 Mastra run 的 suspend/waiting/resume、run-scoped interruptId、decisionSchema、approve/reject、幂等、冲突、超时、取消、SSE 重连和 TTL 清理通过；SOP 当前 run 卡片浏览器验收通过，离开 run 后无全局待办。 | 默认设为 `true`，进入独立生产验收。 |
| 14.6/14.7 恢复 | `restartResume` | 通过 | Loop、Subworkflow、Agent child run 与 Human Approval 均以 Mastra snapshot 为唯一执行状态权威完成跨进程恢复；已成功非幂等节点不重放，必要 mapping、事件和 decision receipt 仅为带 TTL 的 run-scoped 技术状态。 | 默认设为 `true`。 |
| 14.7 综合基线 | 运行与事件门槛 | 通过 | 连续 3 轮、每轮并发 10 个高级 Workflow，共 30/30 成功并产生 912 个产品事件；单 run event id 严格递增，`sinceId` 回放、慢消费者、断线重连、取消竞态和终态关闭通过。 | 支持上述六项能力进入验收。 |
| 14.8 汇总报告 | 报告一致性 | 通过 | 本报告已同步 run-scoped interrupt 产品边界、最终测试指标、浏览器验收和默认矩阵。 | 保持 `parallelMerge = false`，其余六项为 `true`。 |
| 14.9 独立用户验收 | 验收边界 | 待用户验收 | 已完成实现方浏览器验收，等待用户对六项开放能力和 `parallelMerge = false` 边界进行最终验收。 | 不修改 PRD-115 tasks。 |

## 综合验证指标

- 生产 Runtime：`@mastra/core@1.52.1`，唯一执行路径为 Mastra。
- 最新稳定版本隔离复测：`@mastra/core@1.55.0` 未解除 Parallel fail-fast 活动 sibling 取消缺口，临时 spike 目录已删除。
- 高级 Workflow release window：30/30 成功，912 个产品事件，最大单轮 121.6 ms，低于 10 秒门槛。
- 同轮 P0 release window：最大单轮 101.5 ms。
- Human Approval 专项：Agent 55 个、BFF 13 个、Web 21 个测试通过，覆盖 approve、reject、schema、幂等、冲突、超时、取消、重连、重启恢复、非幂等不重放和 TTL 清理。
- 全量发布门：Agent 131 个文件、526 个测试；Workflow smoke 13 个文件、84 个测试；workflow-core 44 个、runtime-contracts 5 个、BFF 52 个、Web 88 个测试全部通过。
- 浏览器验收确认 Agent 管理、Skill Hub、全局导航和聊天无审批收件箱或伪造审批；Human Approval Inspector 保留设计态配置；waiting 卡片只存在于当前 run，approve/reject 均恢复同一 run，关闭运行面板后卡片消失；health 为 `mastra-only`。
- 首次浏览器 approve 揭示 compiler 将 Human Approval 错误视为普通顺序节点，导致 approved/rejected 两条后继同时执行。现已将 Condition 与 Human Approval 统一识别为 router，并增加先失败回归测试；修复后 approve 只执行 approved 分支，reject 只执行 rejected 分支。
- 默认矩阵 SHALL 只拒绝 `parallelMerge`；Agent 与 BFF 使用同一矩阵开放 Iteration、Loop、Nested Workflow、Agent、Human Approval 和 restart/resume。

## 验证命令

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
openspec status --change "enable-mastra-workflow-stage-e" --json
openspec validate "enable-mastra-workflow-stage-e" --type change
openspec status --change "migrate-agent-runtime-to-mastra" --json
openspec validate "migrate-agent-runtime-to-mastra" --type change
```

## 发布判断

阶段 E 不再使用整体总开关。Iteration、Loop、Nested Workflow、Agent、Human Approval 和 restart/resume 已通过并默认开放；`parallelMerge` 继续关闭。当前生产路径仍唯一为 Mastra，不恢复 Legacy Runtime，不修改 PRD-115。OpenSpec archive 仍在用户验收和必要提交后单独进行。
