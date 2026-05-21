## 1. Subagent 角色与层次元数据

- [x] 1.1 扩展 `subagent-types.ts` 与 `subagent-manager.ts`，为子代理记录增加 role 与 parent agent 元数据。
- [x] 1.2 更新 `subagent.ts` 工具 schema 与输出，支持显式传入 role/parent 信息并在 list/snapshot 中展示。
- [x] 1.3 更新 subagent 相关通知/摘要，让协调者可以从输出中识别代理角色。

## 2. Team inbox unread/ack

- [x] 2.1 扩展 `team-store.ts`，为 inbox 增加 read cursor 持久化。
- [x] 2.2 更新 `team-manager.ts` 与 `team.ts`，让 `team_read_inbox` 返回 unread 信息，并新增 `team_mark_inbox_read`。
- [x] 2.3 更新 team 通知与测试，确保 unread/ack 语义稳定。

## 3. Task claim 与 owner 可见性

- [x] 3.1 新增 `task_claim` 工具并复用现有 claim 逻辑。
- [x] 3.2 更新 task list/details 输出，显示 owner 和已分配状态。
- [x] 3.3 更新 autonomy/claim 相关测试，确认显式 claim 与自动 claim 不冲突。

## 4. 验证

- [x] 4.1 新增或更新 unit tests，覆盖 subagent role、team ack、task claim。
- [x] 4.2 新增 PRD-74 smoke 测试，覆盖 multi-agent 协作核心路径。
- [x] 4.3 运行 OpenSpec validate、定向测试、`pnpm build` 和对应 smoke 测试。
