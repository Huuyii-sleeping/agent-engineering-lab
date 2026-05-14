# PRD-48 TUI 命令发现与帮助视图抛光

## 背景

当前 CLI / TUI 的控制能力已经明显增强，但命令发现仍然偏“工程原型”：

- `/help` 是一份越来越长的总表，缺少按工作流拆分。
- TUI 左侧 `Controls` panel 信息过满，用户很难一眼看出当前最该用什么。
- 已经有快捷键和 session / composer 能力，但帮助入口还不够轻量。

这类问题不会阻塞功能，却会直接决定这个终端 Agent 是否“像一个成熟产品”。

## 目标

- 让 `/help` 支持按主题分层。
- 让 TUI 提供更紧凑、上下文化的 guide 面。
- 为 TUI 增加专用 help 快捷入口。

## In Scope

- `/help` 支持 topic：如 `draft`、`sessions`、`runtime`、`approvals`、`all`
- 未知 help topic 的稳定错误与提示
- TUI 左侧控制面重构为更紧凑的 guide / shortcuts
- `Ctrl+G` help 快捷入口
- CLI / TUI 文案、focused tests、build、OpenSpec strict

## Out of Scope

- 命令自动补全
- 完整 command palette
- React/Ink TUI 重做
- Web 帮助界面

## 验收标准

- `/help <topic>` 能返回对应工作流帮助和示例。
- TUI 默认态与 composer 态展示不同的 guide 提示重点。
- `Ctrl+G` 在 TTY 中可触发本地帮助，且不抢占非空 prompt 输入。
- banner / footer / help 至少一处体现 help 快捷入口。
- focused tests、build、OpenSpec strict 通过。
