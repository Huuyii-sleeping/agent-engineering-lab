## Context

项目路线已拆分为增量 PRD。
本变更仅实现 PRD-00：用最小运行闭环验证 tool-calling 契约端到端可用。
约束：
- 架构保持最小化，便于快速验证与回归。
- 在工具边界强制执行命令安全策略。
- 保证对话循环在 CLI 中可观测、可预测。

## Goals / Non-Goals

**Goals:**
- 提供稳定的 `agentLoop(messages)`，遵循标准 tool-call 处理流程。
- 提供 `runBash(command)`，支持超时、危险片段拦截、输出截断。
- 提供 CLI 体验：固定提示符与明确退出行为。

**Non-Goals:**
- 多工具分发。
- 持久化状态管理（todo/task board）。
- subagent、skill loading、context compact、background、teams、worktrees。

## Decisions

决策 1：本阶段采用单工具架构。
- 选择：工具定义与处理器仅暴露 `bash(command)`。
- 理由：降低控制流复杂度，减少调试变量。
- 备选：本阶段同时引入文件工具。
- 未采纳原因：会扩大范围，降低验收隔离性。

决策 2：安全检查前置到 shell 执行前。
- 选择：命中危险片段即拒绝，不进入 spawn。
- 理由：快速失败且无部分执行风险。
- 备选：仅依赖操作系统权限限制。
- 未采纳原因：行为受环境差异影响大，不利于一致性。

决策 3：采用规范化循环契约。
- 选择：先追加 assistant 消息，再逐条追加 `role: tool` 结果。
- 理由：符合标准 tool-calling 流程，历史可完整重建。
- 备选：汇总所有工具输出后一次追加。
- 未采纳原因：会丢失单工具可追踪性，并可能影响后续工具调用链。

## Risks / Trade-offs

- [Risk] 简单片段匹配可能误伤合法命令。
  -> Mitigation: 保持黑名单显式可审阅，后续阶段再优化匹配精度。
- [Risk] 固定超时值在不同环境下可能偏短或偏长。
  -> Mitigation: 先使用 PRD 约定默认值（120s），后续阶段再参数化。
- [Risk] 输出截断可能隐藏关键诊断信息。
  -> Mitigation: 保留明显截断标识，后续考虑流式输出与分段展示。

## Migration Plan

1. 实现最小主循环与单工具处理器。
2. 接入 CLI 入口，并用短命令进行冒烟验证。
3. 按验收标准验证正常流、无工具流、危险命令拦截、退出行为。
4. 后续阶段以增量方式扩展，不破坏 PRD-00 行为契约。

Rollback strategy:
- 回滚 PRD-00 对应文件或提交，恢复到改造前基线。

## Open Questions

- PRD-01 是否应将危险命令检查从子串匹配升级为精确 token 匹配？
- timeout 与输出上限是否应立即提升为共享常量，还是继续延后？
