## Why

当前系统已有 observability、secret scanning、approval 与 retention 的局部能力，但缺少一个面向安全追责的本地审计账本。生产级 agent 需要能回答“谁在何时通过哪个 session 触发了什么敏感 runtime 行为、结果如何、是否被阻断”，同时不能把敏感 payload 原文写入审计文件。

## What Changes

- 新增 `local-runtime-audit` 能力，定义本地 append-only audit JSONL 账本。
- 审计范围限定为本地高价值 runtime 行为：
  - session chat started / completed / failed；
  - tool execution started / completed / blocked / failed；
  - security approval created / consumed / denied；
  - DLP / secret scanning blocked；
  - local cleanup / retention action。
- 审计事件必须带 schemaVersion、event id、timestamp、category、action、outcome、session id、trace id、subject、redacted summary。
- 审计 payload 必须在落盘前执行 hidden character 清理和 secret-like 脱敏。
- `.audit` 纳入现有本地 retention / cleanup 契约。
- In Scope：本地 `.audit/events.jsonl`、审计写入 API、最小查询/摘要 helper、核心单元测试。
- Out of Scope：远端 telemetry / SIEM 上报、组织级策略 UI、完整 RBAC、性能指标大盘、全量历史迁移。

## Capabilities

### New Capabilities

- `local-runtime-audit`: 定义本地运行时安全审计账本、事件结构、脱敏要求和最小查询能力。

### Modified Capabilities

- `local-data-retention-controls`: 明确 `.audit` 必须服从本地 retention / cleanup contract。

## Impact

- 新增或修改 `apps/agent-cli/src/audit/**`。
- 接入 service chat、tool execution、security approval / DLP、cleanup 等局部写入点，先覆盖最重要路径。
- 新增 `apps/agent-cli/test/unit/audit/**` 或镜像源目录的单元测试。
- 不新增外部依赖，不改变现有 HTTP API。
