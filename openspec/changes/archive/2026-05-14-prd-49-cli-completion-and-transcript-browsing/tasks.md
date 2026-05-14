## 1. PRD 与规格

- [x] 1.1 新增 `PRD-49` 增量文档，定义 CLI 补全与 transcript 浏览范围
- [x] 1.2 新增 proposal / design / delta spec / tasks，并在实现后同步主规格

## 2. 命令补全

- [x] 2.1 抽出共享 completion helper，支持 slash command 和高频本地参数补全
- [x] 2.2 接入交互 CLI 与 TUI 的 `readline` completer

## 3. Transcript 浏览

- [x] 3.1 新增 transcript browser helper / state，支持 history、search、peek、tail
- [x] 3.2 在 `dispatchCliCommand` 中暴露相关本地命令并更新 help / guide / footer
- [x] 3.3 让 TUI Conversation panel 反映当前浏览状态，而不只固定显示 recent tail

## 4. 验证

- [x] 4.1 focused tests 覆盖 completion、history/search/peek/tail 和 TUI browse panel
- [x] 4.2 运行 build、OpenSpec strict 和差异检查
