## Context

当前 daemon 体系已经具备：

- `DaemonLock` 用于本机单实例与状态探测
- `AgentServiceClient.initialize()` 用于 health / bridge / session 初始化
- 前台 CLI/TUI/MCP attach 会在 lock 显示 `running` 后继续尝试初始化 client

问题在于 `daemon status` 只使用第一层信息，attach 使用前两层信息。结果是 status 与 attach 对“daemon 可用”的判断并不一致。

## Goals / Non-Goals

**Goals:**

- 让 `agent-cli daemon status` 与 attach 共用相同的 daemon 可用性判断
- 在进程仍存在但 service 不可用时输出明确诊断
- 保持现有 attach 行为不变，只抽出复用 probe

**Non-Goals:**

- 不修改 daemon lock 状态枚举
- 不引入新的 HTTP endpoint
- 不改变 CLI/TUI/MCP 的 fallback 语义

## Decisions

### 1. 抽出 daemon service probe，而不是让 status 直接 new client

决策：

- 在 `service-api/daemon-client.ts` 中新增统一 probe，返回 lock status、readiness 和错误信息。
- `resolveRunningDaemonServiceClient()` 复用这个 probe，仅在 ready 时返回 client。

原因：

- attach 与 status 需要共用同一判断，避免再次漂移。

备选方案：

- 只在 `daemon-status.ts` 里内联 health probe。
- 不采用原因：会形成第二套 daemon 健康逻辑。

### 2. readiness 异常保持 `running` 进程语义，但控制面返回失败

决策：

- 当 lock 为 `running` 但 client 初始化失败时，status 文案仍以 running 为基础，但追加 `service_unavailable` 细节。
- 此时 `runDaemonStatus()` 返回非零退出码。

原因：

- 这能同时表达“进程活着”和“当前不可复用”两个事实。

备选方案：

- 把这类状态直接降级成 `stale`。
- 不采用原因：`stale` 语义是锁记录不可信或进程不存在，而不是 service unready。

## Risks / Trade-offs

- [Risk] status 命令比纯读锁慢，因为会多一次本地 HTTP 探测。
  → Mitigation：只在 lock 为 `running` 时执行 probe；未运行或 stale 仍保持轻量路径。

- [Risk] 错误信息如果直接透出底层 fetch 细节，可能不够稳定。
  → Mitigation：status 输出保留简短错误摘要，不把完整堆栈暴露给终端用户。
