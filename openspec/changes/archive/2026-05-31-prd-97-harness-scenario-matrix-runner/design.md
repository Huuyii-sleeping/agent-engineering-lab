## Context

当前 harness 已经具备三层能力：

- `workspace.ts` 提供隔离 workspace fixture。
- `model.ts` / `openai-client.ts` 提供确定性模型和 OpenAI-compatible client。
- `agent.ts` 可以驱动真实 `QueryEngine`，并注入 fake runtime services、工具 fixture、hook block、scheduled notification 与结构化断言。

不足在于生产 agent loop 的 golden 场景仍写在 `agent-harness.test.ts` 中。测试能证明能力存在，但不能作为稳定的本地验收入口被列举、筛选或复用于后续 PRD。对照 Claude Code 一类成熟 agent 的工程形态，核心差距不是缺少更多 mock，而是缺少围绕真实运行内核的可重复场景矩阵。

## Goals / Non-Goals

**Goals:**

- 建立 test-only harness scenario matrix 注册表，集中管理核心 production agent loop 场景。
- 提供 `runHarnessScenarioMatrix()`，支持全量运行、按名称筛选和返回结构化汇总。
- 提供文本摘要格式，方便 `test:harness` 和后续命令行门禁读取失败原因。
- 将现有 golden 场景迁移为矩阵定义，并保留单元测试覆盖。
- 保证矩阵运行不访问真实网络、不写入持久化运行目录。

**Non-Goals:**

- 不做远端评测服务、历史报表或 dashboard。
- 不迁移全部 smoke / regression 脚本。
- 不改变生产 `QueryEngine`、CLI、daemon 或 service 行为。
- 不为测试引入新的外部依赖。

## Decisions

### 决策 1：新增 `test/harness/matrix.ts`，而不是放进 `src/`

- 方案：场景矩阵属于 test-only harness，放在 `apps/agent-cli/test/harness/matrix.ts`。
- 理由：它服务本地验证，不是产品运行时 API；放在 `src/` 会扩大生产包边界。
- 备选：放入 `src/harness`。未采用，因为会把测试 fixture 和 fake services 暴露成运行时模块。

### 决策 2：矩阵复用 `HarnessAgentScenario` 定义

- 方案：矩阵中的每个 case 直接持有 `HarnessAgentScenario`，runner 调用 `runHarnessAgentScenario()`。
- 理由：PRD-95 已经让该 runner 覆盖真实 `QueryEngine` 路径，复用它能避免形成第二套测试 DSL。
- 备选：新增 YAML / JSON 场景格式。未采用，因为当前场景需要函数式 tool handler，纯数据格式会过早引入解释层。

### 决策 3：结果汇总保持轻量结构化

- 方案：runner 返回 `{ total, passed, failed, results }`，每个 result 保留场景名、状态、失败步骤和步骤明细，并提供 `formatHarnessMatrixSummary()` 输出文本摘要。
- 理由：单元测试和后续 CLI 都能消费结构化结果；文本摘要只做展示，不作为事实源。
- 备选：直接抛异常中断。未采用，因为矩阵需要一次运行多个场景并汇总失败。

### 决策 4：`test:harness` 使用单独 Vitest 文件执行矩阵

- 方案：新增 `test/unit/harness/matrix.test.ts` 验证列表、筛选、摘要和全量矩阵通过；`test:harness` 继续通过 Vitest 运行 harness 单测。
- 理由：保持现有测试工作流和覆盖报告，不新增一次性脚本。
- 备选：新增 `tsx test/harness/run-matrix.ts`。本轮不采用，因为 PRD-97 目标是本地门禁能力，Vitest 已能稳定承载。

## Risks / Trade-offs

- [Risk] 矩阵场景和普通单测重复覆盖。→ Mitigation：将核心 golden 场景集中在 matrix 定义，单测只验证 runner 和矩阵执行结果。
- [Risk] 后续场景过多导致 `test:harness` 变慢。→ Mitigation：runner 支持按名称筛选，本轮只纳入 fast local 场景。
- [Risk] 场景名称成为外部筛选契约后改名成本上升。→ Mitigation：使用稳定 kebab-case 名称，并在测试中覆盖筛选行为。
