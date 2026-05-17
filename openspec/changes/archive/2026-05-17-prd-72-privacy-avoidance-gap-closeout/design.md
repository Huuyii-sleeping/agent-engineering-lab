## Context

对照《03-privacy-avoidance》，当前仓库已经有用户数据治理披露面，但缺少一组真正可执行的“少留、少记、少连、少发”控制：

- `apps/agent-cli/src/runtime-config.ts` 目前的 retention 天数最小值是 `1`，没有 `0` 或 `off` 语义。
- `apps/agent-cli/src/runtime/query-preparation.ts` 会默认执行 `autoExtract("user", latestUserInput)`，并默认执行 memory injection。
- `apps/agent-cli` 的 interactive CLI / TUI / MCP 入口在检测到本地 daemon 可用时会优先 attach。
- MCP capability 当前按项目配置自动加载，虽然已有 trust / provenance / security gate，但缺少一层统一“禁用外部能力”的隐私姿态。
- `.observability` 当前是本地面，不是远端 telemetry，但也缺少最小化或彻底关闭模式。
- `apps/agent-cli/src/governance/user-data.ts` 会披露数据面，却不会披露“当前有哪些隐私规避控制已经实现并生效”。

因此，这次 PRD 的重点不是再写一份新的数据盘点，而是把“隐私规避控制面”补成单独 capability，并把做不到的远端/组织级能力明确留成缺口。

## Goals / Non-Goals

**Goals:**

- 用一个 PRD 覆盖当前仓库与《03-privacy-avoidance》之间最关键的隐私规避缺口，不再拆第二个变更。
- 建立统一的隐私控制 contract，覆盖持久化、memory、observability、daemon attach、MCP 外部能力五类默认行为。
- 让治理面能够同时回答两类问题：
  - 系统当前接触哪些数据面。
  - 用户当前可以关闭或最小化哪些数据面。
- 对当前仓库还不具备的云端/组织级隐私能力保持诚实登记，不用本地近似能力硬凑。

**Non-Goals:**

- 本轮不实现 account / org / subscription 级策略同步。
- 本轮不实现 remote telemetry / analytics sink，也不伪造 essential-only 或组织级关闭开关已经存在。
- 本轮不实现 shared team memory、memory sync、transcript share、training-improvement uploads。
- 本轮不定义新的云端产品面，只定义当前本地仓库应具备的最小化控制 contract。

## Decisions

### 1. 用一个统一 capability 承载隐私规避控制，而不是只在现有 spec 上零散补开关

决策：
- 新增 `privacy-minimization-controls` 作为统一控制面。
- 该 capability 只定义“最小化姿态”和“各模块必须遵守什么”，不强绑某个具体 UI 或单一配置文件形态。

原因：
- 当前缺口是跨模块的：session、memory、observability、daemon、MCP 各做各的，用户无法得到一份完整答案。
- 只改单个模块 spec 会继续让隐私规避停留在实现细节，而不是产品 contract。

备选方案：
- 只在 `user-data-governance-surface` 里补说明，不新增 capability。
- 不采用原因：那会继续停留在“披露”层，不能形成真正的“控制”层。

### 2. 采用“分项控制 contract”，而不是一个含义模糊的大一统 privacy mode

决策：
- 隐私规避最少拆成五个独立控制面：
  - persistence
  - memory
  - observability
  - remote attach
  - external capabilities
- 允许后续组合成 profile，但 spec 第一阶段不强制只暴露一个黑盒模式名。

原因：
- 当前差距本来就是分项存在，强行用一个 `privacy=on` 容易掩盖某些面仍未关闭。
- 用户在本地往往只想关掉其中一部分，例如保留 session 但关闭 auto memory，或保留 observability 但禁用 daemon attach。

备选方案：
- 只定义单个 `strict_privacy` 模式。
- 不采用原因：扩展性差，也不利于治理面精确披露每个面到底有没有被关闭。

### 3. `local_only` 必须成为显式运行姿态，而不是把 daemon auto-attach 当作不可避免的默认行为

决策：
- `agent-host-daemon-runtime` 必须允许前台入口显式拒绝 attach 到已有 daemon。
- 该姿态下 bridge / daemon reuse / remote ingress 都不得被隐式扩大。

原因：
- 当前自动 attach 行为对“本机多入口复用”友好，但对“本次只想在当前进程、当前会话里运行”并不友好。
- 隐私规避语义里，默认不扩大边界比默认复用长期宿主更重要。

备选方案：
- 保持当前默认 attach，只在治理文档里提示风险。
- 不采用原因：这只是披露，不是控制。

### 4. no-persistence / no-auto-memory / observability-minimized 必须是第一类 contract，不再只靠 retention 或 query-only 近似

决策：
- `local-data-retention-controls` 需要支持 no-persistence 或 zero-retention override。
- `memory-knowledge-retrieval` 需要支持关闭 auto extract、关闭 auto inject，必要时完全不让 memory 进入 prompt。
- `observability-replay-debug` 需要支持默认、本地最小化、关闭三种等价姿态。

原因：
- retention 只能回答“多久删”，不能回答“能不能一开始就不写”。
- memory 的真实隐私问题不只是落盘，还包括它自动回流进下一轮模型请求。
- observability 虽然是本地数据面，但依然是额外记录面，不能默认视为无成本。

备选方案：
- 继续用 retention 天数和治理说明近似表达“隐私规避”。
- 不采用原因：这不能覆盖用户真正关心的硬关闭语义。

### 5. 外部能力与远端隐私能力必须分层处理：本地先做禁用，云端仍保留缺口

决策：
- `mcp-external-capability-bus` 第一阶段只要求支持禁用或显式 allowlist。
- remote telemetry essential-only、组织级关闭、identity-bound policy、team memory sync、training uploads 统一登记为 `reserved_gap`。

原因：
- 当前仓库没有这些远端产品面，硬写成交付项只会制造假象。
- 但这些能力又确实是《03-privacy-avoidance》关注的部分，所以必须保留在同一个 PRD 里，而不是遗漏。

备选方案：
- 用现有 trust policy、governance surface 或本地 observability 去弱等价这些云端能力。
- 不采用原因：语义不成立，且会掩盖真实缺口。

## Risks / Trade-offs

- [Risk] 这个 PRD 会和上一份 user-data governance PRD 看起来相邻。 -> Mitigation：本次聚焦“控制面”，不是重复“数据面盘点”。
- [Risk] 分项控制过多会增加实现成本。 -> Mitigation：先统一 contract，再按优先级逐项落地，不要求一次全做完。
- [Risk] 用户可能把 `reserved_gap` 误解成近期承诺。 -> Mitigation：在 proposal、spec、tasks 中统一用“当前未实现，仅保留缺口”表述。
- [Risk] `local_only` 与 daemon reuse 的默认策略可能和现有开发便利性冲突。 -> Mitigation：保留默认模式，只新增显式最小化姿态，不强行改变所有用户默认路径。

## Migration Plan

1. 先建立 `privacy-minimization-controls` spec，定义五类控制面和 `reserved_gap` 语义。
2. 再为 retention、memory、observability、daemon attach、MCP 分别补充必须遵守该控制面的 requirement。
3. 最后让 `user-data-governance-surface` 与 `system-prompt-pipeline` 能披露“当前哪些数据类别被关闭或被抑制”。
4. 后续实现阶段按本地最可落地顺序推进：
   - no-persistence
   - no-auto-memory
   - local-only attach
   - MCP disable/allowlist
   - observability minimized

## Open Questions

- 统一控制面最终暴露为 CLI 命令、静态配置文件，还是 service manifest，需要后续实现阶段定稿。
- no-persistence 是否只覆盖 session / transcript / prompt dump，还是也要扩展到 scheduler / tasks / worktree 等其他本地工件。
- observability 的 `minimal` 语义是否需要保留错误与审计事件，而关闭普通 trace 事件，需要实现阶段进一步细化。
- MCP 的隐私最小化是否只做全局禁用/allowlist，还是要进一步细到 server 级、tool 级两层，需要实现阶段决定。
