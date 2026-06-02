## Context

`apps/web-console` 当前是只读 runtime dashboard，并在 Vite middleware 中直接读取 `apps/agent-cli` 的本地运行文件。现在已经有 `apps/bff`，Web 应改为只调用 BFF。本变更先做本地开发控制台的 Chat 首屏，服务单用户本地开发场景。

## Goals / Non-Goals

**Goals:**
- 把 Web Console 首屏变成可交互 Chat 界面。
- 使用 BFF API 完成 session 创建、选择、transcript 加载和 message 发送。
- 页面结构采用开发工具式三栏布局：左侧 sessions，中间 chat，右侧状态/详情。
- 明确显示 BFF/agent 连接状态、当前 session busy 状态、请求错误。
- 保持 Web 与 agent runtime 解耦，所有请求走 `/api/*`。
- 保留可扩展点：Chat v1 真正需要的新 BFF endpoint 可在同一 change 小步补充。

**Non-Goals:**
- 不做完整 Dashboard。
- 不做账号、权限、多用户。
- 不做完整 tool approval。
- 不做复杂 observability 分析。
- 不做 WebSocket。

## Decisions

1. 先实现 Chat 工作台，不保留 Dashboard 为首屏。
   - 理由：用户明确希望先做 Chat；Dashboard 可以后续作为二级页或右侧面板扩展。
   - 备选：Dashboard + Chat tabs。未采用，因为 v1 应减少页面复杂度。

2. 前端 API client 封装 BFF DTO，组件不直接拼 fetch。
   - 理由：BFF endpoint 仍会随 Web 需求演进，API client 可以吸收路径和错误格式变化。
   - 备选：组件内直接 fetch。未采用，因为会让状态处理和错误处理分散。

3. 发送消息采用 request/response 完成后刷新 transcript。
   - 理由：BFF 已支持 `/api/sessions/:id/messages`；流式显示可以后续接 `/api/events/stream`。
   - 备选：v1 直接做 SSE 流式 token。未采用，因为 agent service 当前 SSE 是事件流，不是 assistant token stream。

4. Vite dev 使用 proxy 到 BFF，移除本地文件读取 middleware。
   - 理由：开发环境和未来生产环境都应经由 BFF。
   - 备选：保留 middleware 作为 fallback。未采用，因为会继续模糊 Web/BFF/agent 边界。

5. UI 风格采用 restrained dark workbench。
   - 理由：本地开发控制台需要扫描、对话和状态监控；高信息密度比营销式视觉更合适。
   - 备选：大 hero / dashboard cards。未采用，因为不符合 Chat 主工作流。

## Risks / Trade-offs

- [Risk] agent service 未启动时 Chat 无法使用。→ 顶部 health 明确显示 disconnected，并保留重试按钮。
- [Risk] 长 transcript 可能影响渲染性能。→ v1 先按普通列表渲染；超过规模后再加虚拟列表。
- [Risk] request/response 不如流式体验。→ v1 先保证闭环，后续基于 SSE 增量实现运行事件/流式状态。
- [Risk] BFF endpoint 可能随 Web 需求增加。→ 只允许为当前页面真实交互新增 endpoint，并配套测试。

## Migration Plan

1. 替换 `web-console` API client 为 BFF client。
2. 替换首屏 React 组件为 Chat Console。
3. 更新 Vite proxy。
4. 添加 API client 测试与 build 验证。
