## 1. Matrix Runner 测试

- [x] 1.1 新增 harness matrix 单元测试，覆盖场景列表、按名称筛选、未知场景失败汇总和文本摘要。
- [x] 1.2 新增 production harness matrix 全量通过测试，确保核心 golden 场景通过真实 `QueryEngine` runner。

## 2. Matrix Runner 实现

- [x] 2.1 新增 `test/harness/matrix.ts`，实现场景注册表、列表、筛选运行和结构化汇总。
- [x] 2.2 将现有 assistant-only、tool-driven、hook-blocked、model-failed、scheduled、read/write、serial-write golden 场景沉淀到 matrix。
- [x] 2.3 更新 `test:harness` 脚本，使其作为 harness 自测和场景矩阵门禁入口。

## 3. 验证与归档

- [x] 3.1 执行 harness 定向测试并修复失败。
- [x] 3.2 执行 `pnpm --dir apps/agent-cli test`。
- [x] 3.3 执行 `pnpm build`。
- [x] 3.4 执行 `openspec status --change "prd-97-harness-scenario-matrix-runner" --json` 与 `openspec validate "prd-97-harness-scenario-matrix-runner" --type change`。
- [x] 3.5 全部通过后归档 OpenSpec change、清理运行产物并本地提交。
