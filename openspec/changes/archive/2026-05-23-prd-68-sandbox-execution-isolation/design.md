## Context

本仓库当前 Bash 安全链路已经包含多层保护：`enforceSecurityGate()` 负责 permission mode 与 security policy / approval；`runBash()` 负责危险片段快速拒绝、环境变量 scrub、超时、输出截断和执行后裸仓库候选清理；`/permissions`、`/status`、`/config`、`/doctor` 提供部分运行态可见性。

缺口在于：这些能力没有被建模为一个显式的 sandbox 姿态。用户无法从控制面判断当前 Bash 是“默认可写”、只读，还是完全关闭额外 sandbox 规则；测试也只能覆盖分散行为，无法证明 sandbox 与权限链路的组合顺序。

## Goals / Non-Goals

**Goals:**
- 增加 `AGENT_BASH_SANDBOX_MODE` 配置，并通过类型约束支持 `off`、`workspace-write`、`strict-readonly`。
- 在 `runBash()` 内部实现 sandbox mode 检查，保持 Bash 工具自身的执行隔离职责。
- 把 sandbox mode 暴露到 CLI status/config/doctor，形成可见控制面。
- 补充测试，证明 sandbox 不替代也不绕过 permission mode、security policy 和 approval。

**Non-Goals:**
- 不实现 OS 级 sandbox、容器、namespace、Job Object、Seatbelt 或网络隔离。
- 不改变 MCP、worktree、background task 的执行模型。
- 不把 sandbox 规则扩展为完整 shell parser；本次只做保守的高置信写入模式识别。
- 不改变 OpenSpec / Superpowers 工作流。

## Decisions

### 1. Sandbox mode 放在 runtime-config

决策：在 `runtime-config.ts` 中新增 `BashSandboxMode` 和 `RUNTIME_CONFIG.bashSandboxMode`，从 `AGENT_BASH_SANDBOX_MODE` 读取，非法值回退 `workspace-write`。

理由：
- 与现有 Bash timeout、输出截断同属运行时配置。
- CLI doctor/status/config 可以直接读取统一来源。

备选方案：
- 放入 `.security/policy.json`：不采用。policy 表达审批/拒绝规则，sandbox mode 是本地运行姿态，混入会让策略与运行时配置边界变模糊。
- 放入 CLI permission mode：不采用。permission mode 是交互控制面姿态，sandbox mode 是 Bash 执行环境姿态，两者需要组合而不是互斥。

### 2. Sandbox 判断放在 Bash 工具内部

决策：`runBash()` 在执行前读取 sandbox mode；当 mode 为 `strict-readonly` 且命令命中高置信写入模式时，返回结构化 `SANDBOX_READONLY_VIOLATION`。

理由：
- Bash 工具已经负责环境 scrub、危险片段、清理和输出归一化。
- `enforceSecurityGate()` 已在工具执行前运行，因此 permission/security 仍先于 Bash sandbox 生效。

备选方案：
- 在 `enforceSecurityGate()` 中做 sandbox 判断：不采用。这样会把 Bash 执行环境细节扩散到安全网关，并让非 Bash 工具也背负 Bash 规则。
- 在 CLI shell shortcut 层判断：不采用。模型工具调用、TUI、service API 也会调用 Bash，CLI 层无法覆盖所有入口。

### 3. Readonly 规则保守匹配

决策：`strict-readonly` 只阻断明显写入型命令片段和前缀，例如重定向写入、`touch`、`mkdir`、`rm`、`del`、`copy`、`move`、`git commit`、`git checkout -b`、`npm install`、`pnpm install` 等。

理由：
- 不引入 shell parser，避免复杂度和误判成本。
- 只读模式的目标是防止明显副作用，不承诺证明命令完全无副作用。

备选方案：
- 完整 shell AST 解析：不采用。跨 PowerShell/cmd/bash 的解析成本高，且本仓库当前 Bash 工具只是通用 shell 执行器。
- 默认拒绝所有 Bash：不采用。已有 `plan` permission mode 可以做到；sandbox 的价值是提供可配置的执行姿态。

### 4. 控制面优先复用现有 CLI snapshot

决策：在 `CliStatusSnapshot` 和 `CliConfigSnapshot` 中增加 `bashSandboxMode`，由 `collectCliStatusSnapshot()`、`collectCliConfigSnapshot()` 填充；`runCliDoctor()` 增加 sandbox check。

理由：
- `/status` 和 `/config` 已经是用户确认 runtime posture 的入口。
- doctor 可对非法值回退、关闭 sandbox 等姿态给出 warn/pass。

备选方案：
- 新增 `/sandbox` 命令：不采用。当前需求只需可见性，新增命令会扩大 CLI 表面。

## Risks / Trade-offs

- [Risk] `strict-readonly` 不是强安全边界，复杂 shell 可以绕过模式匹配。→ Mitigation：文档与错误信息明确这是本地 guardrail，不宣称 OS 级隔离；高危命令仍由 security policy 和 approval 覆盖。
- [Risk] 写入模式误判导致只读排查命令被阻断。→ Mitigation：只阻断高置信写入前缀/片段，用户可临时切回 `workspace-write`。
- [Risk] 控制面字段增加导致测试 fixture 需要更新。→ Mitigation：集中更新 CLI UI/doctor/commands 测试。

## Migration Plan

1. 新增配置字段，默认 `workspace-write`，保持现有行为基本不变。
2. 增加 readonly 阻断，仅在显式设置 `AGENT_BASH_SANDBOX_MODE=strict-readonly` 时生效。
3. CLI status/config/doctor 新增展示字段。
4. 如出现误判，用户可设置 `AGENT_BASH_SANDBOX_MODE=off` 回退到原有安全策略 + approval 行为。

## Open Questions

- 暂无。OS 级隔离、网络隔离和完整 shell parser 已明确排除在本 PRD 范围外。
