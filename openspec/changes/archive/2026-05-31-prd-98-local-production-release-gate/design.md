## Context

`apps/agent-cli/package.json` 当前的 `release:check` 是一串 `pnpm lint && pnpm test && ...`。这种方式能执行检查，但有几个生产级 v1 收口缺口：

- 新增的 `test:harness` / harness matrix 没有进入统一门禁。
- OpenSpec 全量校验没有进入统一门禁。
- 运行结束后没有确认 `.audit`、`.observability`、`.security` 等本轮测试产物是否残留。
- 失败信息主要依赖 shell `&&` 中断，阶段名和后续维护不够清晰。

本轮不扩大成 CI 平台，只把本地发布门禁变成可维护的 test-only runner。

## Goals / Non-Goals

**Goals:**

- `pnpm release:check` 仍是根目录统一入口，并委托 `agent-cli` 的 release gate。
- `agent-cli` 的 release gate 串行执行明确阶段，覆盖 lint、harness、unit、root build、关键 smoke / regression 和 OpenSpec 全量校验。
- release gate 提供可读阶段日志，失败时能定位具体阶段。
- release gate 在启动前和每个阶段后清理受管本地运行 / 测试产物，并在结束时检查残留。
- 阶段定义、产物清理和产物检查可通过快速单测验证。

**Non-Goals:**

- 不做并行调度、重试、历史趋势或 Web 报告。
- 不改造各 smoke 脚本内部实现。
- 不纳入尚未定义为发布必跑的所有历史 smoke。
- 不处理远端 CI、远端执行或发布推送。

## Decisions

### 决策 1：使用 TS runner 替换长 `&&` 命令

- 方案：新增 `test/smoke/release-gate.ts`，`release:check` 改为 `tsx test/smoke/release-gate.ts`。
- 理由：TS runner 可以维护阶段名、cwd、命令参数和产物检查，失败信息比长 shell 串更清晰。
- 备选：继续追加 `&& pnpm test:harness && openspec validate --all`。未采用，因为会继续放大可读性和维护问题。

### 决策 2：阶段定义放在 `test/harness/release-gate.ts`

- 方案：将 `getReleaseGateStages()`、`findReleaseArtifactResidues()` 等纯逻辑放到 test harness 模块，runner 只负责编排和执行。
- 理由：阶段定义可以用单元测试验证，避免每次改脚本都必须完整跑发布门禁才能发现拼写或覆盖问题。
- 备选：全部写在 smoke runner 中。未采用，因为不利于 TDD 和后续维护。

### 决策 3：产物清理和检查只处理 AGENTS 明确列出的本地运行目录

- 方案：清理并检查 `apps/agent-cli` 下 `.tasks`、`.team`、`.worktrees`、`.transcripts`、`tmp`、`.memory`、`.audit`、`.observability`、`.security`、`.runtime`。
- 理由：这些目录已在仓库规则中被定义为运行 / 测试产物，不纳入提交；release gate 应确认它们没有残留。
- 备选：扫描所有 dotfile。未采用，因为 `.git`、`.github`、`.env*`、`.npmrc` 等是配置或版本控制文件，不能误判。

### 决策 4：OpenSpec 使用 `validate --all` 而不是强制 strict

- 方案：本轮 release gate 纳入 `openspec validate --all`。
- 理由：AGENTS 当前要求每次实现至少执行 `openspec validate`，历史 spec 中仍有一些 Purpose 待清理，不在本轮扩大成 strict 收口。
- 备选：立即切到 `--strict`。未采用，因为这会把本轮目标从 release gate 变成全仓 spec 文档清理。

## Risks / Trade-offs

- [Risk] `release:check` 运行时间变长。→ Mitigation：这是正式本地门禁，日常开发仍可跑 focused tests。
- [Risk] smoke 脚本可能产生允许的短期产物。→ Mitigation：release gate 在阶段后清理规则列出的产物目录，最终仍残留时失败并列出路径。
- [Risk] lint 或旧 smoke 发现既有问题。→ Mitigation：如果验证失败，按系统化调试定位；不绕过重要门禁。
