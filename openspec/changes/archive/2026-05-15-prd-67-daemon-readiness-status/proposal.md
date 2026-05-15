## Why

当前 `agent-cli daemon status` 只读取 lock 文件，因此它只能回答“进程是否存在”，不能回答“共享 daemon service 是否真的 ready”。这会让 daemon 控制面和 attach 语义出现偏差：用户看到 status 是 running，但前台入口仍可能因为 health/bridge 初始化失败而无法复用。

现在需要把 status 从“锁状态输出”推进到“控制面可用性探测”，让它和当前 daemon attach 语义保持一致。

## What Changes

- 为 daemon status 增加 readiness 探测：在 lock 为 `running` 时继续探测 HTTP service 是否可初始化。
- 当 daemon 进程存在但 service 不可用时，status 输出明确的 unready 信息，并返回非零退出码。
- 复用统一 daemon client probe 逻辑，避免 status 与 attach 各自维护不同的健康判断。

### In Scope

- `daemon status` readiness 探测
- daemon client probe 抽象复用
- 对应单测、README 与主 spec 同步

### Out of Scope

- 新增远程管理协议
- daemon restart / autostart
- web console 或其他前端改造

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `agent-host-daemon-runtime`: daemon status 从单纯 lock 探测提升为 lock + service readiness 的控制面探测

## Impact

- 影响代码：`apps/agent-cli/src/entrypoints/daemon-status.ts`、`apps/agent-cli/src/service-api/daemon-client.ts`
- 影响测试：daemon status、daemon client 相关单测
- 影响文档：`apps/agent-cli/README.md` 与主规格
