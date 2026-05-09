# agent-web-console

独立的 web 展示层骨架，技术栈使用 React + TypeScript + Tailwind。

## 启动

```bash
cd apps/web-console
pnpm install
pnpm dev
```

## 现在包含

- 运行状态展示
- 任务面板与 todo 快照
- 可观测性指标与最近事件
- Vite 中间件提供的只读 API

## 当前 API

- `GET /api/runtime/snapshot`
- `GET /api/tasks`
- `GET /api/todos`
- `GET /api/observability/metrics`
- `GET /api/observability/events`

## 数据来源

- `../agent-cli/.tasks`
- `../agent-cli/.runtime/todos.json`
- `../agent-cli/.observability`

当前实现是只读视图，不会从 web 端直接修改 agent 状态。
