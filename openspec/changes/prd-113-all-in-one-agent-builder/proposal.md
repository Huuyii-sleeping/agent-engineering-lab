## Why

当前 Web Console 的产品重心仍然是单一聊天会话。用户希望项目转向 all-in-one agent 平台：先有一个类似 Vercel 主介绍页的项目入口，再进入分 Tab 的工作台，逐步承载 Agent 测试、Skill 加载、SOP 编排和后续更多能力。

如果继续只围绕聊天界面迭代，后续 skill、SOP、模板、自动化和多 agent 能力会缺少统一入口。第一阶段需要把 Web Console 的信息架构从“Chat-first”扩展为“介绍页 + 工作台 Tabs”：聊天仍保留为 Agent 测试 Tab，Skill 加载先做成 SkillHub 形式。

## What Changes

In Scope:
- 新增项目介绍首页，展示 AI Studio 的定位，并提供“立即开始”入口。
- 点击“立即开始”后进入工作台，工作台使用 Tab 组织能力。
- 第一阶段提供两个 Tab：
  - `Agent 测试`：承载原聊天测试页。
  - `Skill 加载`：以 SkillHub 形式展示可下载 skill，并支持本地下载/取消下载状态。
- Skill 下载状态保存在浏览器本地存储，刷新后可恢复。
- 保留 Agent Builder / SOP 组装代码基础作为后续子页面，不在当前 Tab 中显式展示。

Out of Scope:
- 不在本阶段实现真正拖拽排序。
- 不在本阶段把 Builder 配置或 skill 下载状态注入 agent runtime 或系统提示词。
- 不新增后端 BFF 持久化接口。
- 不引入账号、团队共享、模板市场或远端发布。

## Impact

- Web Console 从单一聊天页扩展为“介绍页 + Tab 工作台”应用。
- 后续可以在该工作台上继续接入 drag-and-drop、模板库、SOP 执行、skill runtime loading 和 agent 发布能力。
