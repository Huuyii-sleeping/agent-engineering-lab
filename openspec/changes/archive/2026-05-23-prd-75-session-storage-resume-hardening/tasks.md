## 1. Journal 持久化与恢复

- [x] 1.1 扩展 `SessionStore` 文件命名与 envelope 类型，新增 per-session `.jsonl` journal 行结构。
- [x] 1.2 修改 `save`，在 no-persistence 开关允许时先追加脱敏 journal 行，再保留现有 JSON 快照写入。
- [x] 1.3 修改 `load`，优先从 journal 的最后有效记录恢复 session，失败时回退旧 JSON 快照。
- [x] 1.4 修改 `list`，合并 journal 与旧快照恢复结果，同 id 以 journal 为准。
- [x] 1.5 修改 `delete`，同步删除 session 快照与 journal。

## 2. 测试与验证

- [x] 2.1 更新 `session-store` 单元测试，覆盖 append-only journal、journal 恢复、旧快照回退、删除清理与 no-persistence。
- [x] 2.2 新增 PRD-75 smoke 测试，覆盖 create/save/reload/continue 等价恢复路径。
- [x] 2.3 运行 OpenSpec validate、定向单元测试、PRD-75 smoke 和 `pnpm build`。
