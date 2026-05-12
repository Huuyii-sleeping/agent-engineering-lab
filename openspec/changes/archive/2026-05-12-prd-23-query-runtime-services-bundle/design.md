## Context

当前 `QueryEngine` 已经显式依赖多项横切 service：delivery、hook、memory、model policy、notification、observability、runtime coordination，以及位于 tools 层的 `ToolService`。

PRD-22 已经把应用级 runtime service 迁到 `src/services/`，但 `QueryEngine` 的构造函数仍继续展开所有 service 字段。这个形态在 service 数量较少时可接受，但继续增长后会带来两个问题：

- 每个入口和测试都需要理解完整 service 列表。
- `QueryEngine` 的依赖边界看起来仍像零散参数，而不是明确 runtime dependency set。

## Goals

- 定义 `RuntimeServices` 作为 query runtime 的横切 service 依赖包。
- 让 `createAgentAppRuntime` 负责组合默认 service 与 override。
- 让 `QueryEngine` 持有 `runtimeServices` 对象。
- 不影响现有调用方逐项 override 的便利性。

## Non-Goals

- 不迁移 `ToolService` 的文件位置。
- 不把所有 app runtime dependency 都塞进 `RuntimeServices`，例如 OpenAI client、model、promptSource 仍属于 query engine 基础输入。
- 不改变 query stage 函数参数形态，除非为了读取 `runtimeServices` 必须调整。

## Decisions

### Decision 1: `RuntimeServices` 包含 QueryEngine 执行所需的横切 service

采纳：

- `RuntimeServices` 包含 `toolService`、`deliveryService`、`hookService`、`memoryService`、`notificationService`、`modelPolicyService`、`observabilityService`、`runtimeCoordinationService`。
- 虽然 `ToolService` 仍位于 `tools/`，但它是 `QueryEngine` 执行一轮 query 必需的 runtime 依赖，因此进入依赖包类型。

备选方案：

- `RuntimeServices` 只包含 `src/services/` 目录内的应用级 service，`toolService` 继续单独传入。

不采用原因：

- 这样 `QueryEngine` 仍有一半依赖是包、一半依赖是散字段，不能真正降低构造函数宽度。
- 这不等于迁移 `ToolService`，只是让 query runtime 的依赖表达更完整。

### Decision 2: 保持单项 override 兼容

采纳：

- `AgentAppRuntimeOverrides` 继续允许传入单个 service override。
- 新增 `runtimeServices` override 作为整体替换入口，但单项 override 优先合并。

备选方案：

- 强制所有测试和调用方传完整 `RuntimeServices`。

不采用原因：

- 会扩大测试改动面，也降低局部 fake 的便利性。

## Risks

- `services/index.ts` 重新导出 `RuntimeServices` 时可能引入 tools 层 import，需避免形成实际运行时循环。
- 测试 fake 需要保持结构兼容。
- `QueryEngine` 内部字段替换时容易漏改。

## Verification

- `pnpm --dir apps/agent-cli exec vitest run --no-cache` focused runtime tests。
- `pnpm --filter agent-cli build`。
- `openspec validate --all --strict`。
