# PRD-91 Agent CLI Harness 层建设

## 背景

当前 `agent-cli` 已经具备较完整的 unit / smoke / release 验证入口，但测试形态仍分散在多个 PRD smoke 与局部单测中。随着 Ink TUI、scheduler、multi-agent、session resume、memory、delivery 等能力逐步完成，下一阶段更需要统一的 harness 层，让场景可以稳定复现、可组合、可回放，而不是靠人工终端试错。

## 目标

- 建立 test-only harness 基础目录，统一临时 workspace、文件 fixture、环境变量恢复与清理。
- 提供 deterministic model harness，用脚本化响应稳定模拟 assistant 文本、tool call 与错误。
- 提供 scenario runner，用结构化步骤表达“准备 -> 执行 -> 断言”的本地 agent 场景。
- 支持基础故障注入断言，用于验证工具失败、模型失败、文件变化和输出包含关系。
- 为后续 Ink TUI PTY、golden transcript、release matrix harness 留出扩展点。

## In Scope

- 新增 `apps/agent-cli/test/harness/` 下的 test-only TypeScript 模块。
- 新增 harness 单元测试，证明 workspace fixture、deterministic model、scenario runner 可用。
- 新增 `test:harness` 脚本，便于单独执行 harness 自测。
- 更新 OpenSpec 规格与归档。

## Out of Scope

- 不引入 `node-pty` 或新增外部依赖。
- 不实现真实 PTY 终端驱动；Ink TUI 真终端 harness 作为后续阶段。
- 不改 production runtime 行为。
- 不替换现有 smoke；本轮先提供可逐步迁移的基础层。

## 验收标准

- `pnpm --dir apps/agent-cli run test:harness` 通过。
- `pnpm --dir apps/agent-cli test` 通过。
- `pnpm build` 通过。
- OpenSpec status / validate 通过并归档。
