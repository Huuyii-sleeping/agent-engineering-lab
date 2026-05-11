## Why

当前仓库已经具备较丰富的 Agent 能力，但这些能力主要是沿着增量 PRD 逐步叠加出来的，结构上更接近“功能完整的 MVP”，还没有收敛成一套真实可用、可持续演进、可逐步投入生产的应用架构。既然目标已经从“教学实验”转向“真正的工具”，就必须把重心从继续横向加功能，转为建立稳定的分层、共享装配和可复用运行时核心。

与此同时，这轮工作不只是做代码重构。用户明确把 Claude Code 参考源码与架构分析视为学习材料，因此本次变更还需要把“阅读源码 -> 提炼模式 -> 映射本仓库 -> 指导实现”的过程沉淀为正式文档资产，避免学习价值停留在对话中。

## What Changes

- 新增生产级运行时架构能力，定义本仓库从入口层、bootstrap、runtime、tools、services、state 到扩展层的目标分层。
- 新增架构学习沉淀能力，要求外部源码分析、本地源码映射和采纳结论进入正式文档。
- 约束 CLI、HTTP service、未来 Web 接入逐步共享同一套应用服务装配，而不是各自拼装依赖。
- 为后续逐步实现建立阶段性任务拆分，避免把生产级重构变成一次性大重写。

In Scope:
- 以 Claude Code `src/` 目录结构与关键文件职责为基调，定义本仓库目标架构
- 建立 `PRD-21` 增量 PRD、OpenSpec artifacts 和学习沉淀文档
- 为后续实现阶段定义共享 bootstrap / composition root、query runtime、tool contract 的演进方向

Out of Scope:
- 一次性完整复制 Claude Code 全部源码结构、UI 或交互模式
- 在本轮直接重写全部 `apps/agent-cli/src/` 模块
- 在没有阶段边界的情况下做大爆炸式重构

## Capabilities

### New Capabilities

- `production-runtime-architecture`: 定义生产级 Agent 的目标分层、共享装配方式和可复用 runtime 边界。
- `architecture-learning-knowledge-base`: 定义架构学习沉淀文档的内容要求、更新方式和与实现阶段的联动关系。

### Modified Capabilities

- None.

## Impact

- 影响文档：
  - `prd/incremental/PRD-21-生产级架构重构与知识沉淀.md`
  - `docs/learning/**`
  - `openspec/changes/prd-21-production-architecture-and-learning/**`
- 后续将影响代码：
  - `apps/agent-cli/src/main.ts`
  - `apps/agent-cli/src/cli.ts`
  - `apps/agent-cli/src/server.ts`
  - `apps/agent-cli/src/agent-service.ts`
  - `apps/agent-cli/src/agent-loop.ts`
  - `apps/agent-cli/src/tools/**`
  - 以及后续新增的 bootstrap / runtime / app services 相关模块
