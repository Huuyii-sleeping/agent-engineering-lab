## Why

当前仓库已经有 Bash 工具、安全策略、审批、权限模式、环境变量清理和执行后裸仓库清理，但这些能力分散在多个模块中，用户无法从控制面确认当前 Bash 是否处于 sandbox 姿态。参考 Claude Code sandbox 实现思路后，本增量需要把 Bash 执行隔离显式建模为可配置、可诊断、可测试的安全执行层。

## What Changes

- 新增 Bash sandbox mode 配置，支持 `off`、`workspace-write`、`strict-readonly`，默认 `workspace-write`。
- 在 Bash 执行前增加 sandbox mode 判断，`strict-readonly` 下拒绝明显写入型命令。
- 保留并明确现有安全链路顺序：permission mode、security policy / approval、sandbox、危险命令快速拒绝、环境 scrub、执行后清理。
- 在本地控制面展示当前 sandbox mode，优先覆盖 `/status`、`/config` 与 `/doctor` 中至少一个入口。
- 增加单元测试与 smoke 测试，证明 sandbox 不绕过现有权限与审批链路。

## Capabilities

### New Capabilities
- `bash-sandbox-execution`: Bash sandbox 执行姿态、readonly 阻断、执行后清理摘要与控制面可见性。

### Modified Capabilities
- `secret-scanning-dlp-guards`: 无需求变更。
- `security-data-hygiene`: 无需求变更。

## Impact

- 影响 `apps/agent-cli/src/runtime-config.ts`、`apps/agent-cli/src/tools/bash.ts`、`apps/agent-cli/src/cli/doctor.ts`、`apps/agent-cli/src/cli/ui.ts` 以及相关 CLI context。
- 新增或更新 `apps/agent-cli/test/unit/tools/bash.test.ts`、`apps/agent-cli/test/unit/cli-ui.test.ts`、`apps/agent-cli/test/unit/cli-doctor.test.ts` 和 smoke 测试。
- 不引入 OS 级 sandbox、容器、网络隔离或新第三方依赖。
