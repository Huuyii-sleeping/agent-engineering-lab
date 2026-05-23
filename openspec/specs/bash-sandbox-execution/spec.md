# bash-sandbox-execution Specification

## Purpose
TBD - created by archiving change prd-68-sandbox-execution-isolation. Update Purpose after archive.
## Requirements
### Requirement: Bash sandbox mode MUST be explicit and configurable
系统 MUST 为 Bash 工具提供显式 sandbox mode 配置，并支持 `off`、`workspace-write`、`strict-readonly` 三种模式；当配置缺失或非法时 MUST 回退到 `workspace-write`。

#### Scenario: Default sandbox mode is used
- **WHEN** 用户未设置 `AGENT_BASH_SANDBOX_MODE`
- **THEN** Bash sandbox mode 为 `workspace-write`

#### Scenario: Invalid sandbox mode falls back
- **WHEN** 用户设置了不支持的 `AGENT_BASH_SANDBOX_MODE`
- **THEN** Bash sandbox mode 为 `workspace-write`

### Requirement: Strict readonly mode MUST block obvious write commands
系统 MUST 在 `strict-readonly` 模式下阻断明显写入型 Bash 命令，并返回结构化错误，避免 shell 继续执行。

#### Scenario: Touch command is blocked
- **WHEN** Bash sandbox mode 为 `strict-readonly` 且命令为 `touch file.txt`
- **THEN** 系统返回 `ok=false`
- **AND** 错误 code 为 `SANDBOX_READONLY_VIOLATION`

#### Scenario: Read command is allowed through sandbox
- **WHEN** Bash sandbox mode 为 `strict-readonly` 且命令为只读查询命令
- **THEN** sandbox 层不阻断该命令
- **AND** 命令仍受 permission mode 与 security policy 约束

### Requirement: Bash sandbox MUST preserve existing permission and security gate ordering
系统 MUST 保持现有执行顺序，使 permission mode 与 security policy / approval 先于 Bash sandbox 生效；sandbox 不得绕过、替代或削弱已有安全链路。

#### Scenario: Plan permission blocks bash before sandbox execution
- **WHEN** permission mode 为 `plan` 且调用 Bash 工具
- **THEN** 系统返回 permission mode 阻断结果
- **AND** Bash 命令不会进入 sandbox 执行阶段

#### Scenario: Security policy still denies critical command
- **WHEN** Bash 命令命中 critical deny policy
- **THEN** 系统返回 `SECURITY_POLICY_DENY`
- **AND** sandbox mode 不会把该结果改写为成功

### Requirement: Bash sandbox posture MUST be visible in local control surfaces
系统 MUST 在本地控制面展示当前 Bash sandbox mode，使用户能够确认 shell 执行姿态。

#### Scenario: Status includes sandbox mode
- **WHEN** 用户运行 `/status`
- **THEN** 输出包含当前 Bash sandbox mode

#### Scenario: Config includes sandbox mode
- **WHEN** 用户运行 `/config`
- **THEN** 输出包含当前 Bash sandbox mode

#### Scenario: Doctor reports sandbox posture
- **WHEN** 用户运行 `/doctor`
- **THEN** doctor 检查项包含 Bash sandbox 姿态

### Requirement: Bash execution cleanup MUST remain observable
系统 MUST 在 Bash 执行后清理本轮新增的裸仓库候选目录，并在发生清理时输出可读摘要。

#### Scenario: Bare repo candidate is scrubbed
- **WHEN** Bash 命令在工作区创建新的裸仓库候选目录
- **THEN** 系统删除该候选目录
- **AND** Bash 输出包含清理摘要

