## Why

当前本地审计、可观测性和安全记录已经能落盘并携带 retention 语义，但缺少统一的清理执行入口，过期 JSONL 行和安全发现记录会持续增长。该变更补齐本地生产级基础设施中的“有界保留与可审计清理”能力，避免把本地运行产物长期累积成新的安全和运维负担。

## What Changes

In Scope:
- 新增本地 retention cleanup 能力，面向 `.audit/events.jsonl`、`.observability/events.jsonl` 和 `.security/secret-findings.json` 执行过期数据清理。
- 对支持 TTL 的 JSONL 记录按 `expiresAt` 修剪；对旧的 observability 记录按 `at + observability_event.retentionDays` 兼容计算过期时间。
- 对安全发现记录按 `createdAt + security_record.retentionDays` 清理过期项。
- 返回结构化 cleanup summary，包含扫描、保留、删除和跳过计数。
- cleanup 动作自身写入本地 audit ledger，便于追踪谁在何时清理了哪些本地产物。
- 遵守本地持久化关闭模式；关闭时不创建或写入新的本地运行产物。

Out of Scope:
- 不实现远端 telemetry、SIEM、云端归档或组织级数据治理策略。
- 不实现 UI、交互式管理面板或后台守护进程自动调度。
- 不做压缩归档、分片轮转或历史文件格式大迁移。
- 不扩大清理范围到未知目录或用户自定义路径。

## Capabilities

### New Capabilities
- `local-retention-cleanup`: 定义本地运行产物的有界清理执行能力、摘要输出和清理动作审计。

### Modified Capabilities
- `local-runtime-audit`: 审计账本需要记录 retention cleanup 动作，并保证 cleanup 写入的审计事件同样脱敏且有 TTL。
- `observability-replay-debug`: observability 本地事件需要具备可清理的 retention 语义，旧事件可通过 `at` 字段兼容清理。
- `secret-scanning-dlp-guards`: secret finding 本地记录需要按 retention contract 清理过期发现。

## Impact

- 影响 `apps/agent-cli/src/security/` 下的本地 retention 基础设施。
- 影响 audit、observability 和 secret scanning 的本地文件格式读取/清理路径。
- 新增或扩展 `apps/agent-cli/test/unit/security/` 下的单元测试。
- 不新增外部依赖，不改变远端系统行为。
