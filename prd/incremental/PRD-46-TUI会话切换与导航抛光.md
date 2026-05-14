# PRD-46 TUI 会话切换与导航抛光

## 背景

当前 CLI / TUI 已经有 session 能力，但切换入口仍然偏原型：

- `/use` 只能吃完整 session id。
- 没有更顺手的前后切换。
- TUI 的 Sessions panel 还没有把“怎么切”表达成明确产品面。

如果继续往每天都愿意开的终端 Agent 走，这块需要补。

## 目标

- 降低多 session 切换成本。
- 让 CLI / TUI 都具备本地、轻量、可发现的会话导航。
- 不引入复杂键盘监听系统，先把命令层和 UI 产品面打顺。

## In Scope

- `/use` 支持 index / unique prefix / latest。
- 新增 `/next`、`/prev`。
- `/sessions` 输出优化。
- TUI Sessions panel、controls、footer、banner 导航提示更新。
- focused tests、build、OpenSpec strict。

## Out of Scope

- raw keyboard shortcuts。
- 会话搜索、重命名、收藏。
- session 持久化结构变更。

## 验收标准

- `/use 2`、`/use latest`、`/use <unique-prefix>` 可切换 session。
- `/next`、`/prev` 可循环切换 session。
- `/sessions` 有序号、active 状态和 message count。
- TUI 仪表盘能明确展示会话切换提示。
- focused tests、build、OpenSpec strict 通过。
