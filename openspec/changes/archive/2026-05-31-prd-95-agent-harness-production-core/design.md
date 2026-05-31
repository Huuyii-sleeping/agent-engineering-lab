## Context

当前 `apps/agent-cli/test/harness/` 已提供三类基础能力：临时 workspace、deterministic model script、结构化 scenario runner。它适合测试 harness 自身，但还没有把真实 `QueryEngine`、runtime services、tool stage、安全 gate、observability、notification、delivery finalization 等生产路径纳入端到端验收。

Claude Code 类 agent 的基础能力会快速跨越多个边界：工具协议、权限、安全、MCP、hooks、memory、context compact、session resume、subagent 等。如果没有生产级 harness，后续每个 PRD 都只能靠碎片单测证明局部行为，无法稳定回答“一个完整 agent round 是否真的按生产路径工作”。

本设计只做本地 harness，不依赖真实模型服务，不实现远端 runner，也不改变生产 query engine 行为。

## Goals / Non-Goals

**Goals:**

- 让 harness 能驱动真实 `QueryEngine.run()`，覆盖 assistant-only、tool-driven、多轮 tool loop 和 stop stage。
- 提供 OpenAI 兼容 deterministic client adapter，把现有 `HarnessModelScriptItem` 转换为真实 query model request 可消费的响应。
- 提供 runtime services fixture，默认 fake service 可记录调用、注入失败、断言 trace/metrics，不触碰真实外部系统。
- 扩展 scenario DSL，支持 agent round、tool outputs、runtime state、trace events、metrics、filesystem side effects、blocked/approval 结果断言。
- 提供 golden scenarios，作为后续权限、memory、subagent、compact PRD 的稳定回归基线。
- 保持现有 harness API 向后兼容，避免影响已有基础测试。

**Non-Goals:**

- 不接入真实 OpenAI、Anthropic 或 Claude Code。
- 不实现跨进程、跨机器、远端 CI 分布式 harness。
- 不把全部 production services 都复制成复杂 mock；只做必要 fake 和 recorder。
- 不重写 query engine、tool runtime、security policy、observability 生产实现。
- 不一次性补齐 memory/session/subagent 的所有生产差距。

## Decisions

### 决策 1：Harness 直接驱动真实 QueryEngine，而不是复制 agent loop

- 方案：新增 `runHarnessAgentScenario()`，内部创建 `QueryEngine`，传入 deterministic client、static prompt source、runtime services fixture、初始 messages/runtimeState/tools，然后执行真实 `QueryEngine.run()`。
- 理由：生产级 harness 的核心价值是验证真实运行路径；复制一套简化 loop 会让测试通过但生产路径仍可能坏。
- 备选：在 harness 中重新实现轻量 agent loop。未采用，因为会造成双实现和行为漂移。

### 决策 2：Deterministic model 扩展为 OpenAI client adapter

- 方案：保留 `createDeterministicModel()`，新增 adapter 将脚本响应转换成 `client.chat.completions.create()` 形状，支持 assistant content、tool_calls、模型错误、截断/空响应等故障注入。
- 理由：现有 query model 层依赖 OpenAI client 接口；adapter 可以无网络、可重复地覆盖真实请求路径。
- 备选：改造 production query model 层直接依赖 harness model interface。未采用，因为会污染生产抽象。

### 决策 3：Runtime services fixture 使用“记录器 + 可注入失败”的薄 fake

- 方案：新增 harness service factory，提供 toolService、hookService、memoryService、notificationService、observabilityService、deliveryService、modelPolicyService、runtimeCoordinationService 的最小实现。每个 fake 记录输入输出，允许场景配置失败、阻断、通知、memory 注入、delivery 结果。
- 理由：测试需要可观测和可控，而不是连接真实外部状态。薄 fake 也能避免把 production service 逻辑复制一遍。
- 备选：直接使用默认 runtime services。未采用，因为会污染真实 `.memory`、`.observability`、scheduler store 或依赖真实环境。

### 决策 4：Scenario DSL 增量扩展，不替换现有 DSL

- 方案：在现有 `HarnessScenarioStep` 之外新增 agent-oriented scenario 类型或独立 `AgentHarnessScenario`，支持：
  - `agentRun`
  - `expectAssistantContains`
  - `expectToolResultOrder`
  - `expectTraceEvent`
  - `expectMetric`
  - `expectRuntimeState`
  - `injectToolFailure`
  - `injectHookBlock`
- 理由：保持旧测试稳定，避免一次性把所有 harness 用例迁移。
- 备选：统一重写 `runHarnessScenario()`。未采用，因为会放大变更面。

### 决策 5：Golden scenarios 放在 unit harness 体系内，先保持快速本地执行

- 方案：新增 `apps/agent-cli/test/unit/harness/agent-harness.test.ts`，用 deterministic client 运行端到端场景；暂不放到 smoke，避免每次 smoke 变慢。
- 理由：harness 本身是开发质量基础，应在普通单测中快速反馈。
- 备选：只做 smoke。未采用，因为反馈过慢，且不利于 TDD。

## Risks / Trade-offs

- [Risk] fake service 与 production service 行为不一致 → Mitigation：fake 只模拟边界输入输出，核心 query/tool 逻辑仍走 production `QueryEngine`、`runQueryToolStage` 和 tool runtime。
- [Risk] OpenAI response shape 变化导致 adapter 脆弱 → Mitigation：adapter 只实现当前 production 层实际读取的字段，并用类型测试保护。
- [Risk] scenario DSL 过度膨胀 → Mitigation：只增加 PRD-95 golden scenarios 必需断言；后续 PRD 需要时再扩展。
- [Risk] observability 断言过细导致测试和实现强耦合 → Mitigation：断言事件 kind、关键字段和顺序，不断言无关时间戳或完整 payload。
- [Risk] timeout/failure 注入可能导致 flaky → Mitigation：默认不使用真实计时等待，优先用 promise rejection 或可控 fake 实现。

## Migration Plan

1. 保留现有 `model.ts`、`workspace.ts`、`scenario.ts` API。
2. 新增 agent harness 文件和单测，不迁移旧用例。
3. 先用新 harness 覆盖 query-engine 最小 golden scenarios。
4. 通过全量 `apps/agent-cli` 单测和 build 后，再在后续 PRD 中把权限、session、subagent、memory 的复杂场景接入该 harness。

Rollback：如果新 harness 有问题，可删除新增 agent harness 文件和对应测试，不影响已有基础 harness。
