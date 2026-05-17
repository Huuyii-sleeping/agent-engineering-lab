## Why

对照外部文档《02-user-data-and-usage》，当前仓库已经覆盖了大量“本地优先”的用户数据面，包括模型上下文组装、本地 session/transcript 持久化、memory、observability，以及 daemon/bridge 控制面；但仍缺少一个统一、用户视角的数据合同，明确回答三件事：哪些信息会进入模型、哪些信息会落到本地、哪些信息会离开本地或在远端模式下扩大边界。

目前最明显的缺口不在单个日志点，而在“治理层缺失”：仓库没有一个统一 surface 把 model input、local persistence、memory 注入、local observability、remote/bridge ingress、以及暂未实现的 account/org、shared team memory、主动上传/训练改进等数据面放在一起说明。为了避免后续继续按主题重复补 PRD，这次需要用一个 PRD 一次性把差距登记完整，并把暂时做不了的部分明确保留为缺口。

## What Changes

- 新增一个统一的 `user-data-governance-surface` capability，用单一数据清单描述当前仓库会接触、存储、注入、导出或保留的用户数据面。
- 为现有的 prompt、session、memory、observability、bridge 五类能力补充 user-data disclosure requirement，使现有实现不仅“能工作”，还能够被用户检查和解释。
- 在一个 PRD 内统一输出对照结果，并把每一类能力标记为 `已实现`、`部分等价`、`待实现` 或 `保留缺口`，避免遗漏。
- 明确保留当前仓库尚未产品化的数据面缺口：
  - account / organization / subscription / OAuth 身份数据面
  - remote telemetry / analytics 的隐私分层、essential-only、组织级关闭开关
  - shared team memory / team memory sync 的身份、隔离、加密与删除传播模型
  - transcript 分享、训练改进类用户主动上传面
- 要求未来任何新增远端或出站数据能力都先接入这份治理面，而不是先落代码、后补说明。

### In Scope

- 基于外部文档对当前仓库进行用户视角的数据面差距梳理
- 新增统一 user-data governance 能力及对应 spec
- 为现有本地能力补充“会接触什么、为什么接触、默认是否启用、如何删除/导出/保留”的 requirement
- 对当前仓库没有实现的产品面缺口进行显式登记

### Out of Scope

- 本轮直接实现完整 OAuth / account / organization 系统
- 本轮直接接入远端 analytics 或训练改进上传
- 本轮直接实现 shared team memory sync 服务
- 本轮把所有治理 requirement 都落实成 CLI/TUI 交互实现

## Capabilities

### New Capabilities
- `user-data-governance-surface`: 用统一数据清单描述模型输入、本地落盘、memory、observability、remote/bridge，以及尚未实现但必须被显式登记的用户数据面。

### Modified Capabilities
- `system-prompt-pipeline`: 增加“哪些上下文会进入模型请求、为什么进入、默认 inspection 如何最小暴露”的 disclosure requirement。
- `agent-service-sessions`: 增加 session/transcript/agent metadata 的本地持久化合同披露 requirement。
- `memory-knowledge-retrieval`: 增加 memory 类型、注入来源、local-only 与 shared/team memory 支持状态的披露 requirement。
- `observability-replay-debug`: 增加 local observability 与 remote analytics/export 的区分披露 requirement。
- `agent-bridge-control-plane`: 增加 bridge/remote ingress 启用后数据边界扩大的披露 requirement。

## Status Snapshot

| Area | Status | Notes |
| --- | --- | --- |
| 进入模型的工作上下文 | 部分等价 | 当前已有 prompt/history/tool/memory/context surfaces，但缺少统一、用户视角的可检查清单。 |
| 本地 transcript / session 持久化 | 部分等价 | 已有持久化与 retention，但缺少统一说明哪些字段被保存、用于什么、如何统一导出/删除。 |
| 本地 memory | 部分等价 | 已有 short/long-term memory 与注入，但缺少对 memory 类型、注入原因、shared/team memory 支持状态的显式披露。 |
| 本地 observability | 部分等价 | 已有 `.observability`，但没有把“本地调试日志”和“远端 analytics 上传”明确区分成不同数据面。 |
| account / org / OAuth 身份数据面 | 保留缺口 | 当前仓库没有完整的账户体系，需要单独登记而不是假装已支持。 |
| team memory / shared memory sync | 保留缺口 | 当前仓库没有组织级 memory sync 产品面，需要单独治理模型。 |
| transcript 分享 / 训练改进上传 | 保留缺口 | 当前仓库没有对应产品面，需要单独登记 consent、脱敏和关闭语义。 |
| remote / bridge ingress | 部分等价 | 当前已有 daemon/bridge/event replay，但缺少“启用后边界扩大了什么”的用户视角披露。 |

## Impact

- 受影响规格：
  - `openspec/specs/system-prompt-pipeline`
  - `openspec/specs/agent-service-sessions`
  - `openspec/specs/memory-knowledge-retrieval`
  - `openspec/specs/observability-replay-debug`
  - `openspec/specs/agent-bridge-control-plane`
- 新增规格：
  - `openspec/specs/user-data-governance-surface`
- 预期影响代码面：
  - `apps/agent-cli/src/runtime/query-preparation.ts`
  - `apps/agent-cli/src/prompt/inspect.ts`
  - `apps/agent-cli/src/service-api/session-store.ts`
  - `apps/agent-cli/src/memory/*`
  - `apps/agent-cli/src/observability/runtime.ts`
  - `apps/agent-cli/src/service-api/bridge.ts`
  - `apps/agent-cli/src/cli/*` 或未来等价 inspection/help surface
