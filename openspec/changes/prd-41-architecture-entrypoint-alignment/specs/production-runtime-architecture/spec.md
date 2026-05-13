## ADDED Requirements

### Requirement: Entry layer MUST dispatch interaction modes before runtime initialization
入口层 MUST 先通过轻量 dispatcher 识别 fast flag 与交互模式，再按需加载具体 entrypoint adapter 和共享 runtime 装配，避免所有调用都直接进入交互 CLI。

#### Scenario: Fast flag does not initialize runtime
- **WHEN** 用户执行版本或帮助查询
- **THEN** 系统直接输出静态信息
- **AND** 不创建 OpenAI client、QueryEngine、tool service 或 scheduler loop

#### Scenario: Default interactive mode is preserved
- **WHEN** 用户不传入入口模式参数
- **THEN** 系统进入现有交互 CLI
- **AND** 继续复用原有 scheduler 与 `runUserQuery` 行为

#### Scenario: Server mode reuses shared runtime
- **WHEN** 用户通过统一入口请求 HTTP server 模式
- **THEN** 系统启动现有 `AgentService` HTTP server
- **AND** 通过共享 bootstrap 装配 runtime 依赖

### Requirement: Headless query mode MUST reuse the UI independent query runtime
Headless query mode MUST 以单次会话执行用户输入，并复用现有 UI independent query runtime，而不是复制模型请求、hook、memory 或工具执行流程。

#### Scenario: Print mode runs one query
- **WHEN** 用户执行 `--print` 并提供 prompt
- **THEN** 系统创建一次性会话状态并调用 `runUserQuery`
- **AND** 将最后一条 assistant 文本写入 stdout

#### Scenario: Print mode surfaces hook blocking
- **WHEN** UserPromptSubmit hook 阻止本轮输入
- **THEN** 系统返回非零退出码
- **AND** 将稳定错误信息写入 stderr

### Requirement: Agent CLI MUST expose a minimal inbound MCP server entrypoint
Agent CLI MUST 提供最小可用的 stdio MCP server entrypoint，使外部 MCP client 能通过 MCP 工具调用同一套 Agent service，而不是只能作为 MCP client 消费外部工具。

#### Scenario: MCP client lists agent tools
- **WHEN** 外部 MCP client 调用 `tools/list`
- **THEN** 系统返回 `agent_chat` 工具及其输入 schema

#### Scenario: MCP client calls agent chat
- **WHEN** 外部 MCP client 调用 `tools/call` 且工具名为 `agent_chat`
- **THEN** 系统调用 `AgentService.chat`
- **AND** 以 MCP text content 和 structured content 返回执行结果

#### Scenario: MCP server rejects unknown tools
- **WHEN** 外部 MCP client 调用未知工具
- **THEN** 系统返回 JSON-RPC 错误
- **AND** 不进入 query runtime
