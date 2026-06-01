## Context

本地运行基础设施已经有三类持久化产物：`.audit/events.jsonl`、`.observability/events.jsonl` / `metrics.json`、`.security/secret-findings.json`。`security/local-retention.ts` 已声明各 artifact kind 的 retention days，`audit` 事件已经写入 `expiresAt`，但系统还没有统一 cleanup 执行器；observability 事件也缺少显式 TTL 字段，安全发现记录只记录 `createdAt`。

该设计只补齐本地生产级基础设施中的有界清理能力，不扩大到远端治理。

## Goals / Non-Goals

**Goals:**
- 提供一个可复用的本地 cleanup service，清理已知本地运行产物。
- 对 JSONL 文件逐行处理，保留合法未过期记录，删除过期记录，并跳过 malformed 行。
- 对旧 observability 事件兼容使用 `at + retentionDays` 判断过期；新事件写入 `expiresAt`。
- 对 security findings 使用 `createdAt + retentionDays` 判断过期。
- 返回结构化 summary，并通过 `recordAuditEvent()` 记录 cleanup 结果。
- 在 local persistence disabled 时不创建或写入新产物。

**Non-Goals:**
- 不实现远端 telemetry、SIEM、组织级策略或云端归档。
- 不做后台定时调度、CLI 命令或 UI。
- 不做通用目录扫描，不删除未知文件。
- 不实现压缩轮转或历史全量迁移。

## Decisions

1. 新增独立 `security/local-cleanup.ts`，而不是把清理逻辑塞进 audit 或 observability 模块。
   - 理由：cleanup 横跨多个 artifact family，放在 security/retention 侧更符合数据治理边界。
   - 备选：分别在 `audit/runtime.ts`、`observability/runtime.ts` 内实现清理。未采用，因为会导致跨模块重复逻辑，summary 和 audit 行为不一致。

2. cleanup 仅处理白名单文件路径。
   - 理由：本次目标是生产级基础能力，不是通用文件清理器；白名单能降低误删风险。
   - 备选：递归扫描 `.audit`、`.observability`、`.security`。未采用，因为目录内未来可能有用户导出或非本流程生成文件，递归删除风险更高。

3. JSONL 清理采用“读入、解析、过滤、原文件覆盖”的最小实现。
   - 理由：当前事件规模和测试范围适合简单可靠实现；返回 deleted/kept/malformed 计数即可满足治理闭环。
   - 备选：流式 rewrite 到临时文件再 rename。未采用在本增量中实现，以避免引入额外复杂度；后续若事件量明显增大再升级。

4. cleanup 自身通过既有 audit API 记录。
   - 理由：上一增量已经建立本地 audit ledger，复用它可以形成可追踪闭环。
   - 备选：写入独立 `.security/cleanup-events.jsonl`。未采用，因为会制造新的治理面和查询入口。

5. observability 新事件补 `expiresAt`，旧事件兼容 `at`。
   - 理由：新数据应具备显式 retention metadata；旧数据不需要迁移即可被清理。
   - 备选：只依赖 `at`。未采用，因为 audit 已经采用 `expiresAt`，保持字段一致更利于后续治理。

## Risks / Trade-offs

- [Risk] 覆盖写 JSONL 过程中进程中断可能导致文件部分写入。→ 本次不做高复杂度事务式写入；测试覆盖正常路径，后续若文件量或可靠性要求提升，再改为临时文件 + rename。
- [Risk] malformed JSONL 行可能包含仍有价值的排障信息。→ cleanup 不保留 malformed 行，但 summary 记录 skipped/malformed 计数，避免坏行长期阻塞清理。
- [Risk] 清理 audit 后又写入 cleanup audit，会让 audit 文件始终至少保留一条新记录。→ 这是预期行为，cleanup 操作本身必须可追踪。
- [Risk] local persistence disabled 时 cleanup 不写 audit，可能少一条治理记录。→ 关闭持久化代表用户明确要求不落盘，本地 audit 也应尊重该姿态。
