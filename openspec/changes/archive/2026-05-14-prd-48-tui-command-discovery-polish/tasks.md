## 1. PRD 与规格

- [x] 1.1 新增 `PRD-48` 增量文档，定义 TUI 命令发现与帮助视图抛光范围
- [x] 1.2 新增 proposal / design / delta spec / tasks，并在实现后同步主规格

## 2. 帮助分层

- [x] 2.1 在 `cli-ui` 中抽出共享 help topic registry，支持 `/help` 概览与 `/help <topic>` 分层输出
- [x] 2.2 为未知 help topic 返回稳定错误，并给出可选 topic 提示

## 3. TUI Guide 产品面

- [x] 3.1 重构 TUI 左侧控制面，提供更紧凑的 `Guide` / `Shortcuts` 和状态相关提示
- [x] 3.2 新增 TUI help 快捷入口，并在 banner / footer / help 中更新提示

## 4. 验证

- [x] 4.1 focused tests 覆盖 help topic、TUI guide 与 help 快捷键
- [x] 4.2 运行 build、OpenSpec strict 和差异检查
