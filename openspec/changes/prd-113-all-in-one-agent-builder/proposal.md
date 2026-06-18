## Why

当前 Web Console 的产品重心仍然是单一聊天会话。用户希望项目转向 all-in-one agent 平台：先有一个类似 Vercel 主介绍页的项目入口，点击开始后进入 Agent 管理界面，而不是直接进入聊天。Agent 管理界面中可以创建、查看、修改、删除不同 agent，并为每个 agent 配置 skill、个性化说明和可执行操作。

如果继续只围绕聊天界面迭代，后续 skill、SOP、模板、自动化和多 agent 能力会缺少统一入口。第一阶段需要把 Web Console 的信息架构从“Chat-first”扩展为“介绍页 + Agent 管理 + Agent 测试”：聊天页仍保留，但只作为对某个 agent 的测试入口。

## What Changes

In Scope:
- 新增项目介绍首页，展示 AI Studio 的定位，并提供“立即开始”入口。
- 点击“立即开始”后进入 Agent 管理界面。
- BFF 新增本地 agent profiles 业务 API：
  - `GET /api/agents`
  - `POST /api/agents`
  - `PUT /api/agents/:agentId`
  - `DELETE /api/agents/:agentId`
- Agent 管理界面支持 CRUD agent。
- Agent 可配置：
  - 名称、描述、适用场景；
  - 已安装 skills；
  - 自定义 actions；
  - system prompt / 个性化说明草稿。
- Agent 管理界面可点击“使用 / 测试”，进入原来的 Agent 对话测试页面。
- 第一阶段测试页仅展示当前选中 agent 信息，不将配置注入 runtime。

Out of Scope:
- 不在本阶段实现真正拖拽排序。
- 不在本阶段把 agent 配置注入 agent runtime 或系统提示词。
- 不引入账号、团队共享、模板市场或远端发布。

## Impact

- Web Console 从单一聊天页扩展为“介绍页 + Agent 管理 + Agent 测试”应用。
- 后续可以在 Agent 管理基础上继续接入 drag-and-drop、模板库、SOP 执行、skill runtime loading 和 agent 发布能力。
