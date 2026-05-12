# PRD-30 Worktree 工具模块边界收口

## 背景

`apps/agent-cli/src/tools/worktree.ts` 同时承载 worktree tool schema、index/event 持久化、命令执行、git dirty guard、closeout 语义和 task 同步。Worktree 是执行车道和任务生命周期的关键状态面，后续继续增强隔离、收尾和恢复能力前，需要先把内部边界拆清楚。

## 目标

- 拆出 worktree types / JSON helper。
- 拆出 worktree store，承接 index / events 持久化与记录归一化。
- 拆出 worktree runner，承接 shell command、git repo 检测、dirty files 检测。
- 拆出 worktree manager，承接 create / enter / run / closeout 流程编排与 task 同步。
- 收窄 `tools/worktree.ts` 为 tool schema 与 public handler facade。
- 补 focused tests 与中文学习沉淀文档。

## 非目标

- 不改变 `WORKTREE_SCHEMA_VERSION`。
- 不改变 `.worktrees/index.json`、`.worktrees/events.jsonl` 格式。
- 不改变 `worktree_*` tool schema、handler 导出、错误码或 JSON 输出 shape。
- 不改变 dirty git guard、force remove、closeout 或 task sync 语义。

## 验收标准

1. `tools/worktree.ts` 不再直接承载 store、runner 和 manager 细节。
2. focused tests 覆盖：
   - worktree record 兼容读取与 closeout 归一化。
   - command preview 与 name validation。
   - create / enter / run / keep / remove 流程。
   - dirty git guard 的结构化错误。
3. 原有 PRD-18 worktree smoke 行为保持通过。
4. `pnpm --filter agent-cli build` 通过。
5. `openspec validate --all --strict` 通过。
6. 新增学习沉淀文档记录本轮采纳与暂不采纳内容。
