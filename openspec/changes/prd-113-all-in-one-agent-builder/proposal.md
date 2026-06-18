## Why

当前 Web Console 的产品重心仍然是单一聊天会话。用户希望项目转向 all-in-one agent 平台：不仅能和一个 agent 对话，还能在更外层的展示/装配页面中选择 skill、编排 SOP，并组合成适合个人工作方式的 agent。

如果继续只围绕聊天界面迭代，后续 skill、SOP、模板、自动化和多 agent 能力会缺少统一入口。第一阶段需要把 Web Console 的信息架构从“Chat-first”扩展为“Agent workspace”：聊天仍保留，但首页能力应转向 agent 装配和工作流配置。

## What Changes

In Scope:
- 新增 Agent Builder / Agent 工坊主工作台。
- 左侧功能导航中通过“应用生成”提供可点击入口，能从原聊天页进入 Agent Builder 子页面。
- Agent Builder 提供三类核心区域：
  - Skill 池：展示可选能力，并支持加入/移除当前 agent 配置。
  - SOP 编排：展示可选流程步骤，并支持加入/移除当前 agent 的 SOP。
  - Agent 配置预览：展示当前选择的技能、流程、使用场景和就绪度。
- 当前配置保存在浏览器本地存储，刷新后可恢复。
- 默认打开 Web Console 时仍保持原聊天页，不把 Builder 替换为首页。
- 第一阶段用点击交互完成拼装闭环，并在文案与布局上为后续拖拽编排留出空间。

Out of Scope:
- 不在本阶段实现真正拖拽排序。
- 不在本阶段把 Builder 配置注入 agent runtime 或系统提示词。
- 不新增后端 BFF 持久化接口。
- 不引入账号、团队共享、模板市场或远端发布。

## Impact

- Web Console 从单一聊天页扩展为多工作台应用。
- 后续可以在该工作台上继续接入 drag-and-drop、模板库、SOP 执行、skill runtime loading 和 agent 发布能力。
