## 1. PRD 与规格

- [x] 1.1 新增 `PRD-50` 增量文档，定义 command palette / launcher 范围
- [x] 1.2 新增 proposal / design / delta spec / tasks，并在实现后同步主规格

## 2. Palette 数据与搜索

- [x] 2.1 新增共享 palette helper / store，支持静态动作、动态 session 候选和 fuzzy search
- [x] 2.2 支持保存最近一次 palette 结果，并允许按 index 选择候选

## 3. CLI / TUI 集成

- [x] 3.1 在 `dispatchCliCommand` 中暴露 `/palette`、`/palette <query>`、`/palette open <index>`
- [x] 3.2 在 TUI 中增加 `Ctrl+K` 快捷入口，并更新 help / guide / footer / banner 文案
- [x] 3.3 更新补全逻辑，纳入 palette 命令及其高频参数

## 4. 验证

- [x] 4.1 focused tests 覆盖 palette 搜索、候选执行和 `Ctrl+K`
- [x] 4.2 运行 build、OpenSpec strict 和差异检查
