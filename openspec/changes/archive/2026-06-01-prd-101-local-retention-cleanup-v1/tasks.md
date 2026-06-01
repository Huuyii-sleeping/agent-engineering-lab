## 1. 测试先行

- [x] 1.1 为本地 cleanup 新增单元测试：audit JSONL 过期行被删除、未过期行保留、summary 计数正确、cleanup 动作被 audit。
- [x] 1.2 为 observability cleanup 新增单元测试：新事件写入 `expiresAt`，旧事件按 `at + retentionDays` 兼容清理。
- [x] 1.3 为 security findings cleanup 新增单元测试：过期 finding 删除、未过期 finding 保留。
- [x] 1.4 为 disabled persistence 新增单元测试：cleanup 不创建运行产物并返回空操作摘要。

## 2. 核心实现

- [x] 2.1 新增 `security/local-cleanup.ts`，实现白名单 artifact cleanup、JSONL 过滤、JSON 数组过滤和结构化 summary。
- [x] 2.2 扩展 observability event 写入结构，新增基于 `observability_event` retention contract 的 `expiresAt`。
- [x] 2.3 cleanup 完成后通过 `recordAuditEvent()` 写入 `retention` 类审计事件。
- [x] 2.4 确保 cleanup 尊重 local persistence disabled，不创建 `.audit`、`.observability` 或 `.security`。

## 3. 验证与收口

- [x] 3.1 运行相关单元测试，确认 TDD 场景通过。
- [x] 3.2 运行 `pnpm --dir apps/agent-cli run release:check`。
- [x] 3.3 运行 `openspec status --change "prd-101-local-retention-cleanup-v1" --json` 与 `openspec validate "prd-101-local-retention-cleanup-v1" --type change`。
- [ ] 3.4 归档 OpenSpec change，运行 `openspec validate --all`。
- [ ] 3.5 清理本轮生成的运行产物并提交本地 commit。
