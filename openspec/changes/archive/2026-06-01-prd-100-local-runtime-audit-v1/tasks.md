## 1. 范围与现状

- [x] 1.1 验证 OpenSpec 变更状态与 delta spec 格式。
- [x] 1.2 阅读现有 observability、security approvals、secret scanning、retention 与 tool execution 实现。

## 2. 审计存储与查询

- [x] 2.1 用 TDD 新增 audit store 单测，验证 append-only JSONL、schema 字段和脱敏落盘。
- [x] 2.2 实现 `AuditStore` / `AuditService` 薄层，复用现有 data hygiene。
- [x] 2.3 新增 bounded query helper，支持 limit、sessionId、traceId、category 过滤。

## 3. 首批生产路径接入

- [x] 3.1 用 TDD 覆盖 AgentService chat started/completed/failed 审计写入。
- [x] 3.2 用 TDD 覆盖 tool/security blocked 或 failed 审计写入。
- [x] 3.3 将 `.audit` 纳入 retention cleanup 或至少实现 disabled persistence 下不写入。

## 4. 验证、归档与提交

- [x] 4.1 运行 targeted audit / service / tool 测试。
- [x] 4.2 运行 `pnpm --dir apps/agent-cli run release:check`。
- [x] 4.3 运行 OpenSpec status / validate。
- [x] 4.4 归档 OpenSpec、验证 `openspec validate --all`、清理运行产物并本地提交。
