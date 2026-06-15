# agent-web-console

本应用是本地 Agent 的 Web Chat Console，技术栈使用 React + TypeScript + Vite + Tailwind。Web 端只访问 BFF 暴露的 `/api/*`，不直接读取 agent runtime 文件，也不直接调用 agent service。

## 本地启动

在仓库根目录分别启动三段本地链路：

```bash
pnpm --filter agent-cli dev server
pnpm --filter agent-bff dev
pnpm --filter agent-web-console dev
```

默认端口：

- Agent HTTP service: `http://127.0.0.1:3181`
- BFF: `http://127.0.0.1:3182`
- Web Console: `http://localhost:5173`

如需修改 BFF 地址，可设置：

```bash
VITE_BFF_URL=http://127.0.0.1:3182 pnpm --filter agent-web-console dev
```

## 当前能力

- 查看 BFF 与 agent service 连接状态。
- 创建、选择和刷新本地 Agent session。
- 读取当前 session transcript。
- 通过 BFF 向当前 session 发送消息。
- 支持 light/dark 主题切换，并保存在浏览器本地存储。

## API 边界

Web dev server 将 `/api/*` 代理到 BFF。当前页面使用的主要接口：

- `GET /api/health`
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/:id`
- `POST /api/sessions/:id/messages`

BFF 继续负责把请求转发给 agent HTTP service，并统一处理上游错误。
