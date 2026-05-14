# PRD-50 Command Palette 本地启动器

## 背景

现在 CLI / TUI 已经有：

- help topic
- `Tab` 补全
- session 导航
- transcript 浏览

但高频动作仍然主要依赖“先想起命令，再完整输入”。这说明终端控制面缺的已经不是单个命令，而是统一 launcher。

## 目标

- 提供本地 command palette。
- 支持模糊搜索本地动作。
- 支持直接执行 palette 候选。
- 为 TUI 提供快捷入口。

## In Scope

- `/palette`
- `/palette <query>`
- `/palette open <index>`
- 静态动作 + 动态 session 候选
- `Ctrl+K`
- help / guide / footer / banner 文案更新
- focused tests、build、OpenSpec strict

## Out of Scope

- 图形化 overlay
- 模型生成式推荐
- 基于历史点击率的复杂排序
- Web launcher

## 验收标准

- `/palette` 能展示高频本地候选。
- `/palette <query>` 能返回模糊搜索结果。
- `/palette open <index>` 能执行最近一次 palette 结果中的候选。
- `Ctrl+K` 在 TTY 下可触发本地 palette，且不抢占非空 prompt 输入。
- focused tests、build、OpenSpec strict 通过。
