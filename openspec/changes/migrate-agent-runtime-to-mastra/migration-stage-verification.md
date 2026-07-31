# Runtime 迁移阶段行为验证

## 结论

截至 2026-07-27，`legacy-only`、`explicit-canary`、`mastra-default-new`、`legacy-create-disabled`、`mastra-only` 和最终 `legacy-removed` 的迁移行为均已按本 change 的阶段任务完成验证。当前仓库只保留 Mastra 生产运行路径；迁移前源码仅存在于不可执行归档中。

本报告采用“历史阶段证据 + 当前终态复验”的方式收口任务 15.7。由于 Legacy Runtime、adapters 和 selector 已按 13.7–13.10 删除，不为复演历史阶段重新接入归档代码，也不恢复任何 fallback 或 rollback 执行路径。

## 验证原则

- 历史阶段以当时完成的 OpenSpec 任务、共享 contract harness 和迁移门禁结果为证据。
- 当前仓库只复验 `mastra-only`、`legacy-removed` 和归档隔离；不能通过恢复 Legacy 来提高“可复测性”。
- Session/run 的 backend 绑定只在创建前发生；已创建运行不得中途切换或在 Mastra 失败后自动重跑。
- `archive/legacy-agent-runtime/` 只用于阅读历史源码，不属于迁移阶段中的可执行 backend。

## 阶段证据矩阵

| 阶段 | 需要证明的行为 | 证据 | 结论 |
| --- | --- | --- | --- |
| `legacy-only` | 四个 Runtime Port 在不改变产品行为的前提下包装原自研 Runtime | 4.1–4.10 完成 Legacy Agent、Workflow、Tool、Memory adapters、Controller 端口化、共享 contract harness 和 capability 冻结；迁移前源码已按基线完整归档 | 历史阶段通过 |
| `explicit-canary` | 只为明确白名单的新 session/run 选择 Mastra，持久化 backend，查询/取消/事件/恢复按原绑定路由，禁止运行中 fallback | 11.1–11.9 完成 backend/adapterVersion/ID mapping、创建前 selection、capability preflight、绑定不可变、rollback 只影响新运行、shadow 副作用隔离及对应测试 | 历史阶段通过 |
| `mastra-default-new` | 新 session/run 默认选择 Mastra，存量继续原 backend，Memory 完成迁移且不长期双写 | 13.1–13.2 与 9.4–9.8 完成；当前各 CLI、TUI、daemon、MCP、headless 和 service 入口统一装配 `createMastraAgentService`，运行记录固定为 `runtimeBackend: "mastra"` | 历史阶段通过，当前终态仍满足 |
| `legacy-create-disabled` | 停止创建新的 Legacy 状态，仅允许存量查询、取消和排空，随后清空活动运行 | 13.3–13.5 完成停止创建、存量运维和排空；当前 Nest 兼容测试确认旧 `/internal/runtime/legacy` 与 `/drain` 路由均为 404 | 历史阶段通过，当前已被更强的删除状态覆盖 |
| `mastra-only` | Agent、Workflow、Tool、Memory、SSE、取消、恢复和服务宿主只使用 Mastra，并通过发布窗口 | 13.6、15.1–15.5、15.12 完成；`mastra-only-release-window.test.ts` 完成 3 轮、每轮 10 个并发 Workflow；`runtimeInfo()` 返回 `mode: "mastra-only"`；`pnpm --filter agent-cli release:check` 通过 122 个测试文件、447 个测试 | 当前可复验，通过 |
| `legacy-removed` | 生产源码、可执行依赖图和运行入口不存在 Legacy Runtime、adapters、selector、旧 Memory/Streaming 和 raw HTTP host | 13.7–13.12 完成；活动入口只导入 Mastra service；归档边界测试确认 `archive/legacy-agent-runtime/` 未进入 workspace、tsconfig、exports、构建、测试或活动源码引用图 | 当前可复验，通过 |

## 当前终态检查

- `apps/agent-cli/src/entrypoints/**`、CLI、TUI、daemon、MCP 和 service host 统一调用 `createMastraAgentService`。
- `apps/agent-cli/src/service-api/index.ts` 的运行信息固定报告 `mastra-only`。
- Agent 与 Workflow 运行快照由 Mastra adapters 写入 `runtimeBackend: "mastra"`。
- Nest host 不再暴露 Legacy runtime 运维路由。
- 归档目录没有 package、tsconfig、exports、构建、测试或启动入口，活动源码不得引用该目录。

## 验证边界

本报告证明 Runtime 迁移路径已经完成，不表示 PRD-115 阶段 E 已恢复。Parallel/Merge、Iteration、Loop、Nested Workflow、Agent 节点和 Human Approval 的产品节点契约与高级运行门槛仍按 `stage-e-capability-report.md` 保持暂停。
