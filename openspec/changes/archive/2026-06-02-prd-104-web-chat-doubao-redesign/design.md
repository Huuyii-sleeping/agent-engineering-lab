## Context

Web Console 当前是三栏深色工作台，状态清楚但视觉密度、留白和输入区位置不符合主流 AI Chat 产品。参考豆包截图，本轮采用更接近 Chat 产品的结构：左侧固定导航与历史列表，中间可读宽度的消息流，底部悬浮 composer。

## Decisions

1. 使用 semantic CSS variables 支撑主题。
   - `data-theme="dark"` 与 `data-theme="light"` 显式控制。
   - 组件不写死主题色，后续可扩展 `system` 或品牌主题。

2. 保留单 React entry，不引入 UI 库。
   - 当前项目轻量，新增 UI 库会扩大依赖和设计边界。

3. 左侧保留本地开发控制台信息，但弱化工程感。
   - nav 区展示 Agent、AI 浏览器、应用生成、云盘、更多等占位入口。
   - history 区继续映射真实 sessions。

4. Composer 固定在 Chat 主区底部。
   - 与豆包类产品一致，减少滚动时输入区丢失的问题。

## Risks

- 当前 agent service 未启动时仍会显示 disconnected；这是预期状态，不隐藏错误。
- 左侧入口为视觉导航占位，本轮不添加路由行为。
