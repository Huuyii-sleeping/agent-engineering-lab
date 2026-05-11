# PRD-21 生产级架构重构与知识沉淀

## 目标

以 Claude Code `src/` 实际源码为第一参考源、配套解析文章为第二参考源、当前仓库可运行实现为第三参考源、`typescript/` 教学源码为第四参考源，把当前 Agent 从“功能已具备但结构偏 MVP”演进为“真实可用、可持续迭代、可逐步投入生产”的工具。

本阶段不追求一次性重写全部能力，而是先建立正确的架构方向、分层边界和学习沉淀机制，让后续每一步实现都能沿着同一条主线推进。

## 参考优先级

1. 外部实际源码：
   - `https://github.com/liuup/claude-code-analysis/tree/main/src`
2. 外部配套解析文章：
   - `https://github.com/liuup/claude-code-analysis/blob/main/analysis/01-architecture-overview.md`
3. 当前仓库可运行实现：
   - `apps/agent-cli/src/`
   - `apps/web-console/src/`
4. 本地教学源码：
   - `typescript/01_agent_loop.ts` ~ `typescript/12_worktree_task_isolation.ts`

## 范围（In Scope）

- 建立生产级架构重构的阶段性路线，而不是继续按功能点横向堆叠。
- 以 Claude Code `src/` 分层结构为基调，明确本仓库未来的目标分层：
  - `entrypoints`
  - `bootstrap / composition root`
  - `runtime / query engine`
  - `tools / permissions / orchestration`
  - `services / state / tasks / memory / hooks`
- 约束 CLI、HTTP service、未来 Web 接入共享同一套应用服务装配，而不是各自拼装依赖。
- 把“学习材料沉淀”作为正式交付物纳入流程，形成可持续更新的架构学习文档。
- 建立标准化学习沉淀模板、每轮输入模板与工作流说明，保证后续每轮都按同一流程推进。
- 为后续逐步实现预留可执行的 OpenSpec change 与任务拆分。

## 非目标（Out of Scope）

- 一次性完整复制 Claude Code 的全部 UI、命令、模式和生态。
- 在单个阶段内重写所有 `apps/agent-cli/src/` 模块。
- 将“学习沉淀”变成脱离代码的纯笔记工程。

## 功能要求

- 入口层不应再直接承载过多业务装配逻辑；共享依赖初始化必须逐步收敛到统一 composition root。
- Query / Agent runtime 必须从 CLI、HTTP、未来 Web 展示层中独立出来，形成可复用核心。
- Tool contract、权限门禁、观测、MCP / subagent / native 路由应逐步形成稳定边界，而不是继续散落在多个入口和大文件中。
- 每一轮架构重构都必须同步更新学习沉淀文档，记录：
  - 参考源码看到了什么
  - 当前仓库差距是什么
  - 本轮采纳了什么
  - 暂未采纳什么及原因

## 验收标准（AC）

- AC-21-1：仓库中存在正式的 `PRD-21`、OpenSpec change 和学习沉淀文档，三者范围一致。
- AC-21-2：后续实现阶段有明确的目标分层，不再以“继续把逻辑塞进现有文件”为默认路线。
- AC-21-3：CLI、HTTP service、未来 Web 入口共享应用装配成为显式目标，而不是隐含约定。
- AC-21-4：学习沉淀文档成为正式交付的一部分，而不是会话中临时说明。
- AC-21-5：后续每个实现阶段都能回指到本 PRD 的目标分层和知识沉淀要求。

## 实施顺序

1. 先完成源码阅读、差距映射和学习沉淀基线。
2. 再建立共享 bootstrap / composition root 与 runtime 边界。
3. 然后逐步拆分 query runtime、tool runtime、service/state 层次。
4. 最后再推进 Web 展示和更完整的产品化交互。
