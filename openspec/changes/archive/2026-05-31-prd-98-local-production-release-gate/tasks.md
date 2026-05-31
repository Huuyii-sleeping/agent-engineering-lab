## 1. Release Gate 测试

- [x] 1.1 新增 release gate 单元测试，覆盖阶段定义包含 lint、test:harness、test、build、OpenSpec 校验。
- [x] 1.2 新增产物残留检查测试，覆盖无残留通过和发现受管目录失败。

## 2. Release Gate 实现

- [x] 2.1 新增 `test/harness/release-gate.ts`，定义阶段列表、受管产物路径和残留检查。
- [x] 2.2 新增 `test/smoke/release-gate.ts`，按阶段执行命令并输出失败阶段。
- [x] 2.3 更新 `apps/agent-cli/package.json` 的 `release:check` 指向 release gate runner。

## 3. 验证与归档

- [x] 3.1 执行 release gate 定向单元测试。
- [x] 3.2 执行 `pnpm --dir apps/agent-cli run release:check`。
- [x] 3.3 执行 `pnpm --dir apps/agent-cli test`。
- [x] 3.4 执行 `pnpm build`。
- [x] 3.5 执行 `openspec status --change "prd-98-local-production-release-gate" --json` 与 `openspec validate "prd-98-local-production-release-gate" --type change`。
- [x] 3.6 全部通过后归档 OpenSpec change、清理运行产物并本地提交。
