## Context

当前仓库已经存在几类可复用基础设施：
- `package.json` / `apps/agent-cli/package.json` 里定义了 build/test/smoke 命令
- `agent-loop.ts` 已具备 per-round observability、恢复、hook 和工具调用链路
- `security.ts` 已经建立了对高风险 shell/写操作的治理边界

PRD-10 的目标不是再引入一套外部 CI，也不是实现复杂测试选择平台，而是在当前本地 Agent 运行时内补齐最小但完整的“交付验证闭环”。

## Goals / Non-Goals

**Goals:**

- 提供统一验证执行器，标准阶段至少覆盖 `lint -> test -> build`
- 在失败时输出结构化结果和可读建议，而不是只返回原始 stderr
- 支持有限自动重试，减少瞬时失败或缓存类失败带来的人工介入
- 生成统一 `delivery_report.json`
- 在主循环中自动触发本轮修改后的验证

**Non-Goals:**

- 不实现全仓库级复杂 impacted-test graph
- 不实现自动提交、自动合并或自动发版
- 不引入外部 SaaS CI 依赖

## Decisions

### 决策 1：新增独立 `delivery.ts`，而不是把验证逻辑塞进 `bash` 或 `agent-loop`

`delivery.ts` 负责：
- 验证计划生成
- 命令执行
- 失败分类
- 自动重试
- 报告落盘

这样可以让主循环只关心“何时触发”和“如何消费结果”，而不是自己编排命令。

### 决策 2：验证流水线以 workspace package 为边界收敛

本仓库是 `pnpm workspace`，当前可运行的核心包主要是：
- `apps/agent-cli`
- `apps/web-console`

因此最小计划采用：
- 根级 `pnpm lint`
- 根级 `pnpm test`
- 根级 `pnpm build`
- 当改动命中 `apps/agent-cli` 时，附加运行关键 smoke / regression

这样既能复用现有脚本，也避免提前实现复杂图分析。

### 决策 3：失败分类保持显式、有限且面向修复

失败不会只回传原始 shell 文本，而是归一到有限分类：
- `LINT_FAILED`
- `TEST_FAILED`
- `BUILD_FAILED`
- `COMMAND_NOT_FOUND`
- `TIMEOUT`
- `TRANSIENT_EXEC_FAILURE`

每类错误都要带 `suggestion`，例如：
- lint 失败提示修正格式/类型问题
- test 失败提示先看对应测试名或回归脚本
- build 失败提示检查类型或打包入口
- timeout / transient 提示允许重试

### 决策 4：自动重试仅处理“可恢复执行失败”，不假装自动修代码

本 PRD 里的“自动修复重试”收敛为两层：
- 对瞬时执行失败、超时、spawn 级错误执行有限重试
- 对确定性业务失败输出结构化建议，交由后续模型轮次修复代码

这样能满足闭环目标，同时避免在没有明确 patch 生成机制的情况下虚构“自动修代码”。

### 决策 5：主循环只在本轮发生写副作用后自动触发一次验证

触发条件收敛为：
- `write_file`
- `edit_file`
- 其他显式声明会修改工作区的工具

这样避免纯读轮次、纯问答轮次被无意义地自动跑整套验证。

### 决策 6：报告写入 `.delivery/delivery_report.json`

报告包含：
- 计划元数据
- 各阶段结果
- 最近失败
- 总结状态
- 风险与建议

路径固定，便于后续 Web 只读展示或归档流程消费。

## Risks / Trade-offs

- [Risk] 根级 `pnpm lint` 依赖 workspace 脚本完整性，而 `web-console` 目前无 `lint/test`
  Mitigation：验证计划先检测脚本存在性，只运行可用阶段，并把跳过原因写入报告

- [Risk] 自动触发验证会增加每轮时长
  Mitigation：仅在发生写副作用后触发一次，并允许通过配置关闭自动验证

- [Risk] “影响分析”如果做得过深会失控
  Mitigation：本次只做基于路径前缀的轻量选择：`apps/agent-cli` 改动附加 smoke，其他改动先跑标准阶段

## Migration Plan

1. 新增 `delivery.ts` 与类型、报告结构
2. 扩展 runtime config，加入自动验证和重试预算配置
3. 在 base tools 中新增 `delivery_validate` / `delivery_report`
4. 在主循环记录本轮写副作用并于收尾前触发自动验证
5. 新增单测与 PRD-10 smoke
6. 构建、测试、更新 tasks
