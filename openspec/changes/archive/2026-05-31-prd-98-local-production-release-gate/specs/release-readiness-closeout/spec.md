## ADDED Requirements

### Requirement: Local production release gate SHALL run named validation stages

本地生产级发布门禁 SHALL 通过单一 `pnpm release:check` 入口串行执行带名称的关键验证阶段。门禁 MUST 覆盖 lint、harness matrix、unit test、root build、关键 smoke / regression 和 OpenSpec 全量校验。

#### Scenario: 执行本地生产级发布门禁
- **WHEN** 维护者在仓库根目录执行 `pnpm release:check`
- **THEN** 系统执行 `agent-cli` 的本地 release gate
- **AND** release gate 按阶段输出当前执行的验证名称
- **AND** 阶段至少覆盖 `test:harness`、`test`、`build` 和 `openspec validate --all`

#### Scenario: 发布门禁阶段失败
- **WHEN** 任一 release gate 阶段命令失败
- **THEN** release gate 以非零状态退出
- **AND** 输出包含失败阶段名称，便于定位是 lint、harness、unit、build、smoke 还是 OpenSpec 校验失败

### Requirement: Local production release gate SHALL clean and reject leftover runtime artifacts

本地生产级发布门禁 SHALL 清理并检查 `apps/agent-cli` 下明确列为运行 / 测试产物的目录或文件残留。门禁 MUST 在启动前和每个阶段后清理 `.tasks`、`.team`、`.worktrees`、`.transcripts`、`tmp`、`.memory`、`.audit`、`.observability`、`.security` 或 `.runtime`，最终仍发现残留时 MUST 失败并列出路径。

#### Scenario: 发布门禁清理受管产物
- **WHEN** release gate 的产物清理执行
- **THEN** 受管产物路径被删除
- **AND** 不删除 `.git`、`.github`、`.env*`、`.npmrc` 或其他项目配置路径

#### Scenario: 发布门禁清理后仍发现产物残留
- **WHEN** release gate 的最终产物残留检查发现受管产物路径仍存在
- **THEN** release gate 失败
- **AND** 输出包含每个残留路径
