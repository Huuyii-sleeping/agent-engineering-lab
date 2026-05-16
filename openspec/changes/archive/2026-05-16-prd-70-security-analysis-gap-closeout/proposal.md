## Why

对照 `https://github.com/liuup/claude-code-analysis/blob/main/analysis/02-security-analysis.md`，当前仓库已经具备本地 approval、audit、MCP 接入、memory、observability 和 session persistence 基础，但仍有一批安全能力只做到“局部等价”或“尚未覆盖”。尤其是 transcript / session / prompt dump 持久化卫生、symlink/path 边界、MCP 信任与能力来源、全链路 secret scanning / DLP、以及本地持久化数据的 retention / cleanup 规则，和文档中的目标态仍有明显差距。

这次新增一个完整 PRD，把差距一次性收口，避免后续再按主题反复补 PRD。对于当前仓库暂时无法直接实现的能力，例如系统级 sandbox、云 telemetry 隐私分层、远端 Team Memory sync 安全模型，本 PRD 也会明确保留为缺口，而不是遗漏。

## What Changes

- 建立一份完整的“安全差距收口”变更，明确区分：
  - 已有能力但仍不完整的本地安全面
  - 当前仓库尚未具备的产品面 / 架构面安全缺口
- 补齐本地持久化安全 requirement：
  - session 持久化、transcript snapshot、prompt dump 的脱敏、保留期、清理和显式删除边界
  - `.memory`、`.observability`、`.security`、`.audit`、`.sessions`、`.transcripts` 的统一 retention / cleanup 治理
- 补齐本地执行边界 requirement：
  - 文件工具的 symlink / `realpath` 级边界校验
  - 受管写入范围、敏感路径 denylist、路径提升与逃逸检测
- 补齐 MCP 安全面 requirement：
  - server 身份/来源/provenance 暴露
  - capability allowlist / trust policy
  - 认证材料、远端能力元数据与工具输出的最小暴露边界
- 新增本地 secret scanning / DLP 防线 requirement：
  - 针对工具输出、落盘文件、workspace 写副作用和提交前校验的 secret-like 扫描与阻断/告警策略
- 明确保留暂未落地的架构级缺口：
  - 系统级 namespace / seccomp / bwrap 类 sandbox
  - 云 telemetry 的隐私分层与最小化上报
  - 远端 Team Memory / shared memory sync 的安全模型

### In Scope

- 外部文档与当前仓库能力的逐项差距梳理
- 本地可落地安全 requirement 的规格补齐
- 需要后续单独实现的架构级缺口登记与分组
- 统一优先级、阶段划分、验收边界和任务拆分

### Out of Scope

- 本轮直接实现所有缺口
- 引入第三方云服务或托管安全平台
- 在没有独立设计的情况下直接接入远端 Team Memory / telemetry
- 把系统级 sandbox 细节一次性落到当前 PRD 的实现范围

## Capabilities

### New Capabilities
- `local-data-retention-controls`: 定义 `.sessions`、`.transcripts`、`.memory`、`.observability`、`.security`、`.audit` 等本地持久化数据的 retention、cleanup、导出与删除边界
- `secret-scanning-dlp-guards`: 定义工具输出、workspace 写入与交付前校验中的 secret-like 扫描、阻断、降级与审计策略

### Modified Capabilities
- `agent-service-sessions`: session 持久化需要增加脱敏、保留期、清理与显式删除要求
- `context-compression`: transcript snapshot 需要增加脱敏、访问边界与生命周期治理要求
- `system-prompt-pipeline`: prompt dump / inspection surface 需要增加受保护导出与最小暴露 requirement
- `memory-knowledge-retrieval`: memory 除现有脱敏外，还需要 retention / deletion / 生命周期治理 requirement
- `mcp-external-capability-bus`: MCP 需要增加信任来源、能力 provenance、allowlist 与认证材料暴露边界 requirement
- `multi-tool-file-ops`: 文件工具需要增加 symlink-safe 边界、敏感路径 denylist 与受管写入策略 requirement

## Status Snapshot

| Area | Status | Notes |
| --- | --- | --- |
| Session persistence hygiene | Implemented | Sensitive history and runtime state now persist through redacted retention envelopes. |
| Transcript snapshot hygiene | Implemented | Snapshot writes are redacted and carry retention metadata plus cleanup hooks. |
| Prompt inspection default minimization | Implemented | Default `/prompt` hides protected dynamic content. |
| Protected prompt export path | Implemented | `/prompt full` now writes to `.security/prompt-dumps/` with retention metadata instead of dumping inline. |
| Memory retention and deletion | Implemented | Short-term and long-term memory entries now expire and support explicit deletion. |
| File boundary `realpath` hardening | Implemented | File tools now resolve through existing ancestors and reject symlink/junction escapes. |
| Sensitive write-path denylist | Implemented | Internal sensitive paths are blocked for direct writes, and managed control paths such as `.env`, `.github/`, `.vscode/`, `.claude/`, and `.codex/` now require higher-risk approval. |
| Shared export/delete contract across all local artifacts | Implemented | A unified local retention contract now defines retention class, cleanup triggers, export mode, and delete mode for session, transcript snapshot, prompt dump, memory, observability, security, and audit artifacts. |
| MCP provenance / trust policy / auth-boundary tightening | Implemented | MCP registrations now carry trust/provenance summaries, untrusted servers are blocked by default, and auth material is reduced to summary-only exposure. |
| Secret scanning / DLP pipeline | Implemented | Tool output, workspace writes, and delivery validation now scan for secret-like content and record block/warn/audit-only findings. |
| System sandbox prerequisites PRD input | Gap kept open | Explicit follow-up scope and prerequisites are documented below for a dedicated runtime-isolation PRD/change. |
| Cloud telemetry privacy controls PRD input | Gap kept open | Explicit follow-up scope and privacy-layering inputs are documented below for a dedicated telemetry PRD/change. |
| Remote Team Memory / shared sync security model PRD input | Gap kept open | Explicit follow-up scope and trust/isolation inputs are documented below for a dedicated shared-memory PRD/change. |

## Governance Baseline

| Artifact Family | Primary Write Entrypoints | Primary Read / Inspection Entrypoints | Baseline Contract |
| --- | --- | --- | --- |
| `.sessions` | `src/service-api/session-store.ts` | session restore / service attach | Protected runtime state, redacted persistence, protected export, explicit delete, 14-day default retention |
| `.transcripts` | `src/tools/context-compact.ts` | compact context replay / transcript surfaces | Protected snapshot, redacted write, protected export, explicit delete, 7-day default retention |
| `.security/prompt-dumps` | `src/prompt/inspect.ts` | `/prompt full` protected export | Protected snapshot, protected export only, explicit delete, 7-day default retention |
| `.memory` | `src/memory/store.ts` | memory search / list / injection | Knowledge store, query-oriented export, explicit delete, short-term 14-day and long-term 90-day defaults |
| `.observability` | `src/observability/runtime.ts` | replay / metrics / delivery surfaces | Operational telemetry, query-only exposure, explicit delete contract, 14-day baseline target |
| `.security` / `.audit` | `src/tools/security-manager.ts`, `src/security/secret-scanning.ts` | security approval tools / protected log inspection | Security-audit class, protected export, explicit delete contract, 30-day baseline target |

## Unified Contract

- Retention classes are now explicit: `protected_runtime_state`, `protected_snapshot`, `knowledge_short_term`, `knowledge_long_term`, `operational_telemetry`, and `security_audit`.
- Cleanup triggers are now explicitly named in one place: `on_write`, `on_read`, `on_startup`, `on_delivery_validation`, and `manual`.
- Export semantics are now unified:
  - High-sensitivity artifacts use `protected_export`.
  - Observability and memory remain `query_only` unless moved through protected export surfaces.
- Delete semantics are now unified:
  - Session, transcript snapshot, prompt dump, memory, observability, security, and audit families all declare `explicit_delete`.

## Follow-up PRD Inputs

### 6.1 System Sandbox Prerequisites

- Runtime-isolation follow-up MUST decide the concrete primitive set per platform: namespace / seccomp / bwrap on Linux, Job Object / low-privilege token strategy on Windows, and seatbelt/sandbox-exec replacement strategy on macOS.
- The follow-up PRD MUST separate tool-runtime isolation from developer-shell convenience so that security posture and local DX are not coupled into one toggle.
- Validation target for the follow-up PRD: prove filesystem, process, and network restrictions survive nested shells and interpreter launches.

### 6.2 Cloud Telemetry Privacy Layering

- Telemetry follow-up MUST define `essential_only` vs richer diagnostic tiers and make the default upload set explicit per event family.
- The follow-up PRD MUST include an organization-level hard-off switch, redaction guarantees, and payload-size ceilings before any remote sink is introduced.
- Validation target for the follow-up PRD: demonstrate that local observability remains complete while remote export remains minimised and disable-able.

### 6.3 Remote Team Memory / Shared Sync Security Model

- Shared-memory follow-up MUST define principal identity, tenant/workspace isolation, encryption boundaries, and explicit delete propagation before sync is enabled.
- The follow-up PRD MUST decide whether shared memory extends the current team protocol or becomes a separate capability with its own trust surface.
- Validation target for the follow-up PRD: demonstrate that one workspace or teammate cannot read, retain, or resurrect another workspace's deleted memory without explicit policy.

## Impact

- 受影响规格：
  - `openspec/specs/agent-service-sessions`
  - `openspec/specs/context-compression`
  - `openspec/specs/system-prompt-pipeline`
  - `openspec/specs/memory-knowledge-retrieval`
  - `openspec/specs/mcp-external-capability-bus`
  - `openspec/specs/multi-tool-file-ops`
- 新增规格：
  - `openspec/specs/local-data-retention-controls`
  - `openspec/specs/secret-scanning-dlp-guards`
- 受影响代码面：
  - `apps/agent-cli/src/service-api/*`
  - `apps/agent-cli/src/tools/context-compact.ts`
  - `apps/agent-cli/src/system-prompt/*` 与 prompt dump 入口
  - `apps/agent-cli/src/memory/*`
  - `apps/agent-cli/src/tools/mcp-*`
  - `apps/agent-cli/src/tools/file-tools.ts`
  - 本地持久化目录与清理任务
- 架构级保留缺口：
  - 系统级 sandbox
  - 云 telemetry 隐私分层
  - 远端 Team Memory sync 安全模型
