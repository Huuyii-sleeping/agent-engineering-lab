## 1. PRD 与规格

- [x] 1.1 新增 `PRD-51` 增量文档，定义 TUI 即时 palette mode 范围
- [x] 1.2 新增 proposal / design / delta spec / tasks，并在实现后同步主规格

## 2. TUI palette mode

- [x] 2.1 为 TUI 增加 palette open/close/selection 本地状态
- [x] 2.2 在 dashboard 中渲染独立 Palette panel
- [x] 2.3 支持 `Ctrl+K` 打开关闭、`Up/Down` 与 `Ctrl+N/Ctrl+P` 导航
- [x] 2.4 支持空行回车执行选中项，普通文本回车刷新 palette query

## 3. 验证

- [x] 3.1 focused tests 覆盖 palette panel、selection 和导航
- [x] 3.2 运行 build、OpenSpec strict 和差异检查
