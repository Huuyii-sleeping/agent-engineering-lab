## Why

当前 Web Chat Console 已经完成 BFF Chat 工作流和 Chat-first 视觉改造，但本地启动后的真实页面仍存在少量产品化收口问题：顶部侧栏按钮图标渲染异常、Web README 仍描述旧的只读 Dashboard，继续开发前需要先把可见瑕疵和启动说明对齐。

## What Changes

In Scope:
- 修复 `apps/web-console` 当前首屏可见的图标渲染瑕疵，避免侧栏按钮显示异常字符。
- 抛光 Web Chat Console 的基础可用性与文案一致性，不改变现有 Chat 工作流。
- 更新 `apps/web-console/README.md`，说明当前 BFF-backed Chat Console 启动链路和 API 边界。
- 运行 Web/BFF 相关测试与构建验证。

Out of Scope:
- 不新增 BFF endpoint。
- 不引入 WebSocket、SSE 实时流或多页面路由。
- 不改 agent runtime 执行语义。
- 不处理当前工作区已有的 agent-cli 非 Web 侧未提交改动。
