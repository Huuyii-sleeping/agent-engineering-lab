## 1. 测试先行

- [x] 1.1 为 Web BFF API client 新增测试：health、sessions、session detail、create session、send message。
- [x] 1.2 验证测试在当前实现下失败，证明 Web 仍未对接 BFF Chat API。

## 2. Web API 与 Dev Proxy

- [x] 2.1 重写 `apps/web-console/src/api.ts` 为 BFF Chat API client。
- [x] 2.2 更新 `apps/web-console/vite.config.ts`，移除本地文件读取 middleware，改为 `/api` proxy 到 BFF。
- [x] 2.3 为 web-console 增加测试脚本和必要测试依赖。

## 3. Chat Console UI

- [x] 3.1 将首屏改造为三栏 Chat 工作台：sessions、chat transcript、session/status info。
- [x] 3.2 实现初始化加载 health + sessions。
- [x] 3.3 实现 create session、select session、load transcript。
- [x] 3.4 实现 send message、loading/busy/error 状态和发送后刷新 transcript。
- [x] 3.5 更新样式，移除 Dashboard 视觉和乱码文案，采用开发工具式暗色 UI。

## 4. 验证与收口

- [x] 4.1 运行 web-console API 测试。
- [x] 4.2 运行 `pnpm build`。
- [x] 4.3 启动本地 BFF/Web dev server，并用浏览器验证 Chat 首屏无空白、布局正常、API 状态可见。
- [x] 4.4 运行 `openspec status --change "prd-103-web-chat-console-v1" --json` 与 `openspec validate "prd-103-web-chat-console-v1" --type change`。
- [x] 4.5 归档 OpenSpec change，运行 `openspec validate --all`。
- [x] 4.6 清理本轮运行产物并提交本地 commit。
