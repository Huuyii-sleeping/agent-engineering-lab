# PRD-49 CLI 补全与 Transcript 浏览

## 背景

现在的 CLI / TUI 已经有不少本地控制能力，但两个明显缺口还在：

- slash command 仍然需要靠记忆和手打；
- transcript 基本只能看末尾摘要，无法本地搜索、翻页和展开单条消息。

这会让终端 Agent 在长会话和高频使用场景下显得不够顺手。

## 目标

- 为 CLI / TUI 提供 `Tab` 补全。
- 为当前 session 提供本地 transcript 浏览控制面。
- 让 TUI Conversation panel 能显示 browse 状态，而不是永远只看尾部。

## In Scope

- slash command 和高频参数补全
- `/history`
- `/history prev`
- `/history next`
- `/search <query>`
- `/peek <index>`
- `/tail`
- TUI Conversation panel browse 状态
- help / guide / footer 文案更新
- focused tests、build、OpenSpec strict

## Out of Scope

- 模型生成式补全
- 全文索引或外部检索后端
- 复杂滚动焦点系统
- Web transcript viewer

## 验收标准

- `Tab` 能补全 slash command、help topic、session selector 等高频参数。
- `/history` 能分页浏览当前 session transcript。
- `/search <query>` 能返回命中项摘要。
- `/peek <index>` 能展开单条消息。
- `/tail` 能恢复到 live tail 展示。
- TUI Conversation panel 能反映 tail / history / search / peek 状态。
- focused tests、build、OpenSpec strict 通过。
