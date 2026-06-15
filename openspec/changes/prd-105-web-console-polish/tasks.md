## 1. 首屏问题修复

- [x] 1.1 复现并定位顶部侧栏按钮显示 `0` 的 CSS/DOM 原因。
- [x] 1.2 修复侧栏按钮、刷新按钮等 header icon 的渲染稳定性。
- [x] 1.3 用浏览器验证桌面首屏不再出现异常字符。

## 2. 文档对齐

- [x] 2.1 更新 `apps/web-console/README.md` 为当前 BFF-backed Chat Console 说明。
- [x] 2.2 明确本地启动顺序、默认端口、API 边界和当前能力。

## 3. 验证与收口

- [x] 3.1 运行 `pnpm --filter agent-web-console test`。
- [x] 3.2 运行 `pnpm --filter agent-web-console build`。
- [x] 3.3 运行 `pnpm --filter agent-bff test`。
- [x] 3.4 运行根级 `pnpm build`。
- [x] 3.5 清理本轮构建/测试产物。
