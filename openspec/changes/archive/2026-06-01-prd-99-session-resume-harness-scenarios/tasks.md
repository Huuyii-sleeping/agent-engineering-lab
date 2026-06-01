## 1. OpenSpec 与现状确认

- [x] 1.1 验证 OpenSpec 变更状态与 delta spec 格式。
- [x] 1.2 阅读现有 AgentService、SessionStore、QueryEngine harness 与 matrix 注册代码。

## 2. TDD 场景

- [x] 2.1 添加最小失败测试，证明当前 harness matrix 缺少 service-level session resume 场景。
- [x] 2.2 添加 session/resume 场景断言：session id、history、runtime state、journal append-only。
- [x] 2.3 添加多 session 恢复隔离断言。

## 3. 实现与集成

- [x] 3.1 复用或补齐本地 deterministic service fixture，使场景通过 AgentService / QueryEngine 链路执行。
- [x] 3.2 将 session/resume 场景注册进 harness matrix，并保证可按 stable name 单独执行。
- [x] 3.3 如服务层缺少必要恢复入口，仅补齐薄适配，不扩大 API 范围。

## 4. 验证、归档与提交

- [x] 4.1 运行 targeted unit / harness 测试。
- [x] 4.2 运行 `pnpm --dir apps/agent-cli run release:check`。
- [x] 4.3 运行 `openspec status --change "prd-99-session-resume-harness-scenarios" --json` 与 `openspec validate "prd-99-session-resume-harness-scenarios" --type change`。
- [x] 4.4 归档 OpenSpec 变更、验证 `openspec validate --all`，清理运行产物并本地提交。
