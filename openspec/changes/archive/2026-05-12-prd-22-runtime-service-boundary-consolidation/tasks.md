## 1. 规格与学习基线

- [x] 1.1 补齐 PRD-22 与 OpenSpec proposal / design / delta specs / tasks
- [x] 1.2 基于 docs 中的下一步说明，确认本轮只做 runtime service 目录与边界校正

## 2. Service 目录收口

- [x] 2.1 新建 `apps/agent-cli/src/services/` 与聚合导出入口
- [x] 2.2 迁移应用级 runtime service 文件并修正内部相对 import
- [x] 2.3 更新 bootstrap、query runtime、agent service、tools 与测试中的 service import

## 3. 文档与验证

- [x] 3.1 新增本轮中文学习沉淀文档
- [x] 3.2 运行 focused unit tests 与 OpenSpec strict 校验
- [x] 3.3 更新任务状态并整理本轮改动说明
