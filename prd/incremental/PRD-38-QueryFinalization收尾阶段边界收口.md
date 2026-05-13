# PRD-38 QueryFinalization 收尾阶段边界收口

## 背景

`apps/agent-cli/src/runtime/query-finalization.ts` 当前同时承载 assistant-only 轮次计数、tool-driven 轮次计数、auto delivery 触发与摘要、Stop hook 调用和 system message 注入。虽然文件不大，但它位于 query runtime 主链路收尾阶段，后续继续扩展 delivery、hook 或 stop reason 时容易混在一起。

## 目标

- 拆出 query finalization types。
- 拆出 round counter 边界，承接 assistant-only 与 tool-driven roundsWithoutTodo 更新。
- 拆出 auto delivery finalizer 边界，承接自动交付验证触发与摘要生成。
- 拆出 stop hook runner 边界，承接 Stop hook 调用与 system message 注入。
- 收窄 `query-finalization.ts` 为 public facade。
- 补 focused tests 与中文学习沉淀文档。

## 非目标

- 不改变 `finalizeAssistantOnlyRound`、`finalizeToolDrivenRound`、`runQueryStopStage` public API。
- 不改变 auto delivery 触发条件、changedPaths、traceId 或 summary 文案。
- 不改变 roundsWithoutTodo 更新语义。
- 不改变 Stop hook payload 或注入消息顺序。

## 验收标准

1. `query-finalization.ts` 不再直接承载 delivery、round counter、stop hook 的全部细节。
2. focused tests 覆盖：
   - round counter 更新。
   - auto delivery pass/fail summary。
   - Stop hook payload 与 system message 注入。
3. 原有 `query-finalization.test.ts` 继续通过。
4. `pnpm --filter agent-cli build` 通过。
5. `openspec validate --all --strict` 通过。
6. 新增学习沉淀文档记录本轮采纳与暂不采纳内容。
