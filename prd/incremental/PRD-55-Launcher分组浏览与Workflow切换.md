# PRD-55 Launcher 分组浏览与 Workflow 切换

## 背景

当前 CLI / TUI 的 palette 已经具备 launcher 雏形，但结果仍然更像“排序后的命令列表”，缺少稳定分组和更细的键盘提示。与此同时，transcript 浏览还停留在翻页、搜索、单条展开三种基础动作，长会话里的连续跳转仍然不够顺手。

另外，当前本地控制面还没有一个统一入口去切换通用 Agent 工作流和偏绘画/图像 brief 的工作流，导致后续产品化扩展缺少稳定落点。

## 目标

- 为 palette 增加稳定分组和更细的本地操作提示。
- 为 transcript 浏览增加更完整的连续导航能力。
- 为 CLI / TUI 增加统一的本地 workflow 切换入口。

## In Scope

- `/workflow`
- `agent` / `draw` 两种本地 workflow surface
- palette workflow 候选、分组显示、细化提示
- `/history first|prev|next|last`
- `/search next|prev`
- `/peek next|prev`
- CLI / TUI 的 prompt、banner、guide、footer、help、completion 同步
- focused tests、build、OpenSpec strict

## Out of Scope

- 真正的图像生成后端
- 新的模型路由协议
- 富文本/彩色 palette 主题系统
- Web transcript viewer

## 验收标准

- `/workflow agent|draw` 能切换本地 workflow surface。
- palette 结果会按稳定分组显示，并包含 workflow 候选。
- transcript 浏览支持 history 首尾跳转、search 连续跳转和 peek 相邻跳转。
- CLI / TUI 的帮助、补全、guide、footer、prompt 会同步反映新的 workflow / palette / transcript 能力。
- focused tests、build、OpenSpec strict 通过。
