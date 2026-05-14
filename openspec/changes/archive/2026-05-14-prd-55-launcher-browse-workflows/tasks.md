## 1. PRD 与规格

- [x] 1.1 新增 `PRD-55` 增量文档，定义 launcher 分组浏览、transcript 深度浏览和 workflow 切换范围
- [x] 1.2 新增 proposal / design / delta spec / tasks，并在实现后同步主规格

## 2. Workflow 与 palette

- [x] 2.1 增加本地 `/workflow agent|draw` 控制面，并同步 CLI / TUI prompt、banner、guide、footer、help、completion
- [x] 2.2 为 palette 增加 workflow 候选、稳定分组显示和更细的操作提示

## 3. Transcript 深度浏览

- [x] 3.1 增加 `/history first|last`、`/search next|prev`、`/peek next|prev`
- [x] 3.2 同步 CLI / TUI transcript renderer，展示 focus / relative navigation 状态

## 4. 验证

- [x] 4.1 focused tests 覆盖 workflow、palette grouping 和 transcript navigation
- [x] 4.2 运行 build、OpenSpec strict 和差异检查
