## Why

当前 `release:check` 仍是一串长 `&&` 命令，覆盖了不少 smoke，但没有纳入新建的 harness matrix、OpenSpec 全量校验和运行产物残留检查，也缺少清晰阶段名。为了给“本地生产级 v1”设置明确终点，需要把发布前验收收敛成一条可读、可维护、可失败定位的本地门禁。

## What Changes

In Scope:

- 将 `apps/agent-cli` 的 `release:check` 收敛为本地 release gate runner。
- release gate 串行执行带阶段名的关键检查：lint、harness matrix、unit test、root build、关键 smoke / regression、OpenSpec 全量校验。
- release gate 在关键阶段后检查 `apps/agent-cli` 下不应残留的本地运行 / 测试产物目录。
- 为 release gate 阶段定义和产物残留检查增加单元测试。
- 更新 OpenSpec 规范，明确本地生产级发布门禁的覆盖范围和失败可读性。

Out of Scope:

- 不新增远端 CI dashboard、历史趋势存储或测试报告数据库。
- 不改变各 smoke 脚本内部行为。
- 不把所有未来检查都塞入当前门禁；只纳入当前已实现且对本地生产级 v1 重要的检查。
- 不自动执行 `git push` 或远端发布。

## Capabilities

### New Capabilities

### Modified Capabilities

- `release-readiness-closeout`: 统一发布检查需要覆盖 harness matrix、OpenSpec 全量校验和运行产物残留检查，并提供清晰阶段失败信息。

## Impact

- 影响 `apps/agent-cli/package.json` 的 `release:check` 脚本。
- 新增 test-only release gate runner 与单元测试。
- 影响 `openspec/specs/release-readiness-closeout/spec.md`。
- 不新增依赖，不改变生产 CLI / daemon / service runtime 行为。
