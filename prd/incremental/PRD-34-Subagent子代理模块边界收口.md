# PRD-34 Subagent 子代理模块边界收口

## 背景

`apps/agent-cli/src/tools/subagent.ts` 当前同时承载：
- tool schema
- 子代理状态与生命周期管理
- 模型策略选择与 fallback
- tool-calling 执行循环
- 完成/失败通知与 observability 回流

前几轮 `task-board`、`scheduler`、`background-task` 已完成同类边界收口，`subagent.ts` 现在成为 tools 层里最明显的“大而全”状态文件之一。

## 目标

- 拆出 subagent shared types / JSON helper
- 拆出 subagent executor，承接模型调用、tool loop 与 fallback
- 拆出 subagent manager，承接生命周期、状态流转、wait 与通知
- 收窄 `tools/subagent.ts` 为 tool schema、默认 manager 与兼容导出 facade
- 补 focused tests 与中文学习沉淀文档

## 非目标

- 不改变 `subagent_spawn` / `subagent_send` / `subagent_wait` / `subagent_list` / `subagent_close` 的 tool schema、JSON shape 或错误码
- 不扩大子代理可用工具范围，继续仅允许 base tools，禁止递归 `subagent_*`
- 不改动 query notification 注入语义或主循环消费方式
- 不引入子代理持久化或跨进程恢复

## 验收标准

1. `tools/subagent.ts` 不再直接承载生命周期状态表、模型执行循环和通知编排细节。
2. focused tests 覆盖：
   - spawn/list/send/wait/close 生命周期
   - busy/closed/not found/timeout 错误语义
   - executor 的无工具完成、tool-calling 循环和预算拒绝/失败路径
3. `pnpm --filter agent-cli test -- --run test/unit/tools/subagent-*.test.ts` 通过。
4. `pnpm --filter agent-cli build` 与 `openspec validate --all --strict` 通过。
5. 新增中文学习沉淀文档，记录本轮采用与暂不采用的边界决策。
