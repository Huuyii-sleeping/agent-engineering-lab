# PRD-33 BackgroundTask 后台任务模块边界收口

## 背景

`apps/agent-cli/src/tools/background-task.ts` 当前同时承载 tool schema、子进程启动、任务状态管理、通知队列、输出截断和 observability 回流。它已经成为 tools 层剩余最明显的异步执行状态聚合文件。

## 目标

- 拆出 background task types / output helper。
- 拆出 background runner，承接子进程启动与事件绑定。
- 拆出 background manager，承接任务状态、通知队列与 observability 编排。
- 收窄 `tools/background-task.ts` 为 tool schema、默认 manager 与兼容导出 facade。
- 补 focused tests 与中文学习沉淀文档。

## 非目标

- 不改变 `background_run` / `check_background` tool schema、JSON 输出 shape 或错误码。
- 不改变后台任务 in-memory 生命周期、通知注入语义或 observability 事件语义。
- 不引入后台任务持久化。
- 不顺手重构 `subagent.ts`。

## 验收标准

1. `tools/background-task.ts` 不再直接承载 spawn、状态流转和通知队列细节。
2. focused tests 覆盖：
   - 输出截断与 snapshot shape
   - completed / failed 状态流转
   - 通知 drain 语义
3. `pnpm --filter agent-cli build` 通过。
4. 相关 focused tests 与 OpenSpec strict 校验通过。
5. 新增学习沉淀文档记录本轮采纳与暂不采纳内容。
