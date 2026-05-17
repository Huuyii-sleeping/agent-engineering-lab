## Why

对照外部文档《03-privacy-avoidance》，当前仓库已经具备一部分“本地优先”基础，但仍缺少真正的隐私规避控制面。现状更接近“知道数据会去哪里”，还不是“可以主动阻断哪些数据面默认发生”。

最明显的缺口有五类：本地 session/transcript/prompt dump 只有 retention，没有硬性 no-persistence 模式；memory 会自动抽取并自动注入，没有显式关闭开关；本地 observability 默认持续写入，没有最小化/关闭模式；前台入口发现 daemon 时会优先 attach，没有显式 local-only 隔离姿态；MCP 会按项目配置自动加载，没有“禁用外部能力”这一层统一隐私控制。用户要求这次只写一个 PRD，因此本变更会把这些缺口一次性收口，并把当前仍不具备的云端/组织级能力明确登记为保留缺口。

## What Changes

- 新增一个统一的 `privacy-minimization-controls` capability，定义当前仓库的隐私规避控制面，而不再把相关开关分散在各模块里各自表达。
- 为本地运行时补齐五类最小化控制 contract：
  - 本地持久化最小化：支持 `no_session_persistence` 或等价零持久化姿态。
  - memory 最小化：支持关闭自动抽取、关闭自动注入，必要时完全禁用本地 memory 参与模型请求。
  - observability 最小化：支持默认、本地最小化、完全关闭三种等价姿态。
  - remote/daemon 最小化：支持显式 `local_only`，阻止前台入口自动 attach 到已存在 daemon / bridge。
  - external capability 最小化：支持禁用 MCP 自动加载，或要求显式 allowlist / trust 才能启用外部能力。
- 修改统一治理面，使其不仅披露“数据面”，还披露“当前有哪些隐私规避开关已经实现、哪些还没有实现”。
- 将当前仓库暂时无法真实实现的能力继续保留为缺口，而不是伪装成本地等价：
  - remote telemetry / analytics 的 essential-only、组织级关闭开关、payload ceiling
  - account / organization / subscription 级隐私策略下发
  - shared team memory / memory sync
  - transcript share / training-improvement uploads / 其他显式出站同意流

## Capabilities

### New Capabilities
- `privacy-minimization-controls`: 统一定义本地隐私规避控制面，覆盖持久化、memory、observability、daemon/bridge attach 与 MCP 外部能力五类最小化姿态。

### Modified Capabilities
- `agent-host-daemon-runtime`: 增加显式 `local_only` 运行姿态，要求前台入口在该姿态下不得自动 attach 到 daemon-backed host。
- `local-data-retention-controls`: 增加高敏感本地工件的 no-persistence / zero-retention override contract。
- `memory-knowledge-retrieval`: 增加 auto memory extract / inject 的关闭 contract，以及 memory 完全不参与模型请求的最小化姿态。
- `observability-replay-debug`: 增加本地 observability 的最小化/关闭 contract，并继续把 remote telemetry privacy tiers 保留为缺口。
- `mcp-external-capability-bus`: 增加外部能力禁用或显式 allowlist 启用的隐私规避 contract。
- `system-prompt-pipeline`: 增加“哪些模型输入类别因隐私姿态被抑制”这一层 inspection / disclosure contract。
- `user-data-governance-surface`: 增加统一隐私姿态与未实现隐私控制缺口的披露 requirement。

## Impact

- 主要影响的运行时与配置面：
  - `apps/agent-cli/src/runtime-config.ts`
  - `apps/agent-cli/src/runtime/query-preparation.ts`
  - `apps/agent-cli/src/observability/runtime.ts`
  - `apps/agent-cli/src/service-api/daemon-client.ts`
  - `apps/agent-cli/src/entrypoints/*`
  - `apps/agent-cli/src/tools/mcp-*.ts`
  - `apps/agent-cli/src/governance/user-data.ts`
- 主要影响的规格面：
  - `openspec/specs/agent-host-daemon-runtime`
  - `openspec/specs/local-data-retention-controls`
  - `openspec/specs/memory-knowledge-retrieval`
  - `openspec/specs/observability-replay-debug`
  - `openspec/specs/mcp-external-capability-bus`
  - `openspec/specs/system-prompt-pipeline`
  - `openspec/specs/user-data-governance-surface`
