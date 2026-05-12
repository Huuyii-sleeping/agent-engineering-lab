## 1. 发布门禁补齐

- [x] 1.1 更新 `apps/agent-cli/package.json` 中的 `release:check`，纳入当前已实现的关键 smoke / regression 脚本
- [x] 1.2 检查相关文档与脚本命名，确保统一发布入口与仓库现状一致

## 2. 归档规格收口

- [x] 2.1 补写 `openspec/specs/` 中残留 `Purpose TBD` 的正式 spec 文件
- [x] 2.2 自检补写结果，确保仅修改 `Purpose` 收口内容，不改变既有 Requirement / Scenario 语义

## 3. 验证与收尾

- [x] 3.1 运行本次变更直接相关的格式化外验证命令，确认 `release:check` 入口和 OpenSpec 状态可用
- [x] 3.2 更新任务状态并整理本轮改动说明
