## Why

当前 Web Chat Console 虽然完成了功能闭环，但视觉仍偏工程面板，阅读和输入体验粗糙，不符合用户期望的现代 AI Chat 控制台。用户明确要求参考豆包式 Chat 界面重新设计，并提前设计好主题切换。

## What Changes

In Scope:
- 重设计 `apps/web-console` 首屏为豆包式 Chat 布局：左侧导航/历史，中间对话区，底部悬浮输入框。
- 保留现有 BFF Chat 工作流：health、session list、create/select/load session、send message。
- 新增主题模式基础：light/dark 切换、localStorage 持久化、CSS token 驱动。
- 保持移动端可用，无横向滚动。

Out of Scope:
- 不增加新的 BFF endpoint。
- 不实现多页面路由、账号、模型选择、插件市场。
- 不修复 agent-cli dev:server 脚本问题。
