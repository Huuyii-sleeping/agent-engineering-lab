# PRD-37 QueryToolStage 工具执行阶段边界收口

## 背景

`apps/agent-cli/src/runtime/query-tools.ts` 当前同时承载工具调用遍历、参数解析、tool_call 观测、PreToolUse / PostToolUse hook、工具执行、tool result 回填、安全阻断事件、写副作用标记、todo 自动完成与 active task 状态同步。随着 query runtime 继续扩展工具执行策略和任务联动，这个文件需要先拆清内部边界。

## 目标

- 拆出 query tool types / shared helper。
- 拆出 query tool hooks 边界，承接 hook blocked output 与 Pre/Post hook 调用。
- 拆出 query tool executor 边界，承接单次工具调用执行、观测、结果分析和 tool message 回填。
- 拆出 query tool task sync 边界，承接 todo 自动完成和 active task 同步。
- 收窄 `query-tools.ts` 为 tool stage orchestration。
- 补 focused tests 与中文学习沉淀文档。

## 非目标

- 不改变 `runQueryToolStage` public API。
- 不改变工具调用顺序、tool result message shape 或 hook 注入顺序。
- 不改变 `HOOK_BLOCKED` JSON shape。
- 不改变 `security_blocked` observability 事件。
- 不改变 todo 自动完成或 active task 状态同步语义。

## 验收标准

1. `query-tools.ts` 不再直接承载 hook、executor、task sync 的全部细节。
2. focused tests 覆盖：
   - hook blocked output。
   - 单次工具调用执行与 tool_result / security_blocked 观测。
   - task_create / task_update / todo 自动完成同步。
3. 原有 `query-tools.test.ts` 继续通过。
4. `pnpm --filter agent-cli build` 通过。
5. `openspec validate --all --strict` 通过。
6. 新增学习沉淀文档记录本轮采纳与暂不采纳内容。
