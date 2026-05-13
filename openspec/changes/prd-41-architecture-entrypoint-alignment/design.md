## Context

外部架构分析把 Claude Code 拆成从入口层到扩展层的多层结构，其中入口层不是直接绑定单一交互表面，而是先做轻量命令分流，再按模式进入交互 REPL、headless query、MCP server 或其他服务入口。

当前仓库已具备：

- `bootstrap/app-runtime.ts` 作为共享 composition root。
- `runtime/query-engine.ts` 与 `runUserQuery` 作为无 UI query runtime。
- `AgentService` 与 HTTP server。
- MCP client / registry / executor，用于把外部 MCP 工具接入工具总线。

缺口集中在：

- `main.ts` 没有 lightweight dispatcher，无法先处理 `--version` / `--help` 等 fast path。
- 没有 headless `--print` 风格单次执行入口。
- 没有 Agent 自身作为 MCP server 暴露给外部 MCP client 的入口。

## Goals / Non-Goals

**Goals:**

- 把入口层显式拆成 dispatcher 与具体 entrypoint adapters。
- 让 fast flags 不初始化 OpenAI client、runtime services 或 scheduler。
- 让 headless 与 MCP server 都复用现有 runtime/service，不复制 query loop。
- 保持现有交互 CLI 和 HTTP server 行为。

**Non-Goals:**

- 不做完整 TUI。
- 不做远端 Bridge。
- 不扩展 MCP server 到多工具管理面，只暴露可验证的 `agent_chat`。
- 不改变现有 package release gate 的语义。

## Decisions

### Decision 1: 新增 `entrypoints/cli-dispatcher.ts`

采纳：

- `main.ts` 只调用 dispatcher。
- dispatcher 负责解析 argv 和动态导入对应 entrypoint。

不采用：

- 继续在 `cli.ts` 中混合 argv 解析、交互循环和 scheduler。

原因：

- fast path 必须避免提前加载 runtime 依赖；动态导入能让 `--version` / `--help` 更接近原架构中的轻入口。

### Decision 2: 新增 `entrypoints/headless.ts`

采纳：

- `--print` / `-p` 以一次性会话运行 `runUserQuery`，输出 assistant 文本。

不采用：

- 直接调用 `QueryEngine.run` 并手写 history/hook 处理。

原因：

- `runUserQuery` 已经封装 UserPromptSubmit hook、compact context 和 assistant 文本提取，复用它能保持入口语义一致。

### Decision 3: 新增 `entrypoints/mcp-server.ts`

采纳：

- 用现有 `writeFrame` 和最小 MCP JSON-RPC 处理器实现 stdio server。
- 默认创建 `AgentService(createAgentAppRuntime())`，对外暴露 `agent_chat`。

不采用：

- 引入 MCP SDK 或复用 MCP client registry。

原因：

- 本轮目标是补齐入口形态；引入 SDK 会扩大依赖和发布风险。client registry 是出站 MCP 工具总线，server adapter 是入站暴露面，职责不同。

### Decision 4: `server.ts` 加直接运行保护

采纳：

- `server.ts` 继续可直接运行，但被 dispatcher 动态导入时不自动启动。

不采用：

- 新增第二个 HTTP server 文件。

原因：

- 直接运行兼容性和 dispatcher 复用都能保留，避免重复服务入口。

## Risks / Trade-offs

- [Risk] MCP server 协议覆盖不完整 -> Mitigation：本轮明确为最小可用入口，只覆盖 initialize、tools/list、tools/call 与 initialized notification。
- [Risk] dispatcher 改动影响原交互 CLI -> Mitigation：默认无参数仍动态导入并执行原 `runCli`。
- [Risk] headless 与交互输出行为不一致 -> Mitigation：headless 只作为单次执行入口，不改变交互 CLI prompt 或 scheduler。
