# production-runtime-architecture Specification

## Purpose
定义生产级 Agent 运行时的目标分层与共享装配边界，约束 CLI、HTTP service 和未来 Web 入口复用同一套 query、tool 与 service runtime。
## Requirements
### Requirement: Repository SHALL define an explicit production runtime layering
仓库 MUST 为生产级 Agent 明确定义稳定分层，至少覆盖 entrypoints、bootstrap / composition root、runtime / query、tools / permissions、services / state 这些职责边界，而不是继续主要依赖隐式约定和大文件聚合。

#### Scenario: 新入口接入共享运行时
- **WHEN** 系统新增一个 CLI、HTTP 或 Web 入口
- **THEN** 该入口通过共享 bootstrap / composition root 装配依赖，并调用同一套 runtime 能力，而不是重新拼装独立业务流

#### Scenario: 运行时逻辑从入口层独立
- **WHEN** 维护者阅读入口文件
- **THEN** 能明确区分参数解析、环境初始化、依赖装配与核心 query / tool runtime，而不是把它们混在单个入口实现中

### Requirement: Query runtime SHALL be reusable across interaction surfaces
Query / conversation runtime MUST 作为可复用核心存在，能够被 CLI、HTTP service 与未来 Web 展示层共享，而不是绑定在单一交互表面中。

#### Scenario: 不同交互表面复用同一 query runtime
- **WHEN** CLI 和 HTTP service 分别发起一轮 Agent 执行
- **THEN** 两者通过同一 query runtime 契约启动执行，只在输入输出适配层存在差异

#### Scenario: 运行时状态独立而装配共享
- **WHEN** 两个不同表面各自创建会话
- **THEN** 它们共享应用装配与服务定义，但保有独立的会话历史与执行状态

### Requirement: Production runtime SHALL define a shared host layer above interaction surfaces
生产运行时 SHALL 在 entrypoints 与 query runtime 之上定义共享宿主层，用于承载长期 session、事件流与运行时生命周期，而不是仅由各交互表面直接拼装 runtime。

#### Scenario: 新入口接入共享宿主
- **WHEN** 系统新增一个 CLI、TUI、HTTP 或 MCP 入口
- **THEN** 该入口优先通过共享宿主接入运行时能力，而不是重新装配独立的 session 与 runtime 状态

#### Scenario: 共享宿主也共享事件流
- **WHEN** 多个 `AgentService` 或前台入口复用同一个 `AgentHost`
- **THEN** 它们通过同一宿主级事件流观察会话创建与 chat 生命周期
- **AND** 事件编号和订阅语义不再按 service instance 分裂

### Requirement: Production runtime SHALL support embedded and daemon-backed host deployment
生产运行时 SHALL 同时支持嵌入式宿主部署与 daemon-backed 长期宿主部署，以兼容当前本地前台执行流程并支持长期运行模式。

#### Scenario: 嵌入式模式运行
- **WHEN** 用户以前台方式启动 `agent-cli`
- **THEN** 系统仍可在当前进程内创建宿主并正常执行

#### Scenario: daemon 模式运行
- **WHEN** 用户以后台 daemon 模式启动 `agent-cli`
- **THEN** 系统创建长期宿主并允许其他交互表面复用其运行时能力

#### Scenario: 前台入口通过共享 daemon client 复用宿主
- **WHEN** TUI、MCP 或其他前台入口检测到本地 daemon-backed host 可用
- **THEN** 它们通过稳定的 service API client 与统一的 daemon client resolver 复用现有宿主
- **AND** 不在各入口内部重复实现 lock/status/health probe 与会话同步逻辑

### Requirement: Tool runtime MUST expose stable contracts and execution context
工具运行时 MUST 形成稳定契约，至少明确工具注册、工具匹配、执行上下文、权限门禁与观测链路的职责归属，支持 native、subagent 与 MCP 工具统一接入。

#### Scenario: 工具来源不同但执行契约一致
- **WHEN** 系统执行 native、subagent 或 MCP 工具
- **THEN** 它们都通过统一的工具执行契约进入路由、权限、观测与结果回填链路

#### Scenario: 新增工具能力时不修改入口主流程
- **WHEN** 系统新增一种工具实现或工具来源
- **THEN** 维护者主要修改工具注册与执行边界，而不是重写 CLI、HTTP 或主循环入口装配逻辑

### Requirement: Runtime services MUST expose a stable application service boundary
应用级 runtime service MUST 通过稳定目录与聚合导出边界暴露给 bootstrap、query engine 与交互入口，而不是继续散落在入口同级根目录中。

#### Scenario: 核心装配引用 service 聚合边界
- **WHEN** 维护者阅读 `bootstrap/app-runtime.ts` 或 `runtime/query-engine.ts`
- **THEN** 这些核心装配路径通过统一 service 边界引用应用级 runtime service，而不是分别引用多个根目录 `*-service` 文件

#### Scenario: 新增应用级 runtime service
- **WHEN** 后续新增一个供 query runtime 或多个入口共享的应用级 service
- **THEN** 该 service 应进入统一 service 边界并通过聚合导出暴露，而不是直接新增到 `src/` 根目录

#### Scenario: 工具协议层 service 保持所属层边界
- **WHEN** 某个 service 主要属于工具协议、注册或执行子系统内部
- **THEN** 该 service 可以保留在 `tools/` 等所属层目录中，并由设计文档说明不迁移原因

### Requirement: CLI local interaction internals MUST live under a dedicated module subtree
CLI 本地交互模块 MUST 具备独立目录边界，避免交互表面内部实现继续散落在应用根层源码目录。

#### Scenario: 维护者阅读源码根目录
- **WHEN** 维护者阅读 `apps/agent-cli/src/`
- **THEN** 应能明确区分应用级入口/组合根文件与 CLI 本地交互模块
- **AND** CLI 命令、renderer、palette、completion、workflow、permissions 等本地交互实现位于专门的 `cli/` 子目录，而不是持续平铺在 `src/` 根层

#### Scenario: 入口表面复用统一 CLI 子树
- **WHEN** CLI 或 TUI 入口需要复用本地交互能力
- **THEN** 它们通过 `cli/` 子目录中的稳定模块引用命令、UI、palette、completion 等能力
- **AND** 不要求调用方继续依赖散落在 `src/` 根层的 `cli-*` 文件路径

### Requirement: Service API and HTTP surface internals MUST live under a dedicated module subtree
会话管理与 HTTP service surface MUST 具备独立目录边界，避免这类对外 API 相关实现继续散落在应用根层源码目录，或与 runtime `services/` 依赖包混在一起。

#### Scenario: 维护者阅读源码根目录
- **WHEN** 维护者阅读 `apps/agent-cli/src/`
- **THEN** 应能明确区分 runtime `services/` 依赖包与对外 service API / HTTP surface
- **AND** `AgentService`、session helpers 和 server launcher 位于专门的 `service-api/` 子目录，而不是持续平铺在 `src/` 根层

#### Scenario: 多入口复用统一 service API 子树
- **WHEN** CLI dispatcher、TUI、MCP server 或 HTTP 启动器需要复用会话管理与对外 service API 能力
- **THEN** 它们通过 `service-api/` 子目录中的稳定模块引用 `AgentService`、session helpers 和 server launcher
- **AND** 不要求调用方继续依赖散落在 `src/` 根层的 `agent-service*` 或 `server.ts` 文件路径

### Requirement: Query runtime services MUST be composable as a dependency bundle
Query runtime 的横切 service 依赖 MUST 能作为稳定依赖包装配和传递，而不是长期依赖不断扩张的构造函数字段列表。

#### Scenario: QueryEngine 接收 runtime services 依赖包
- **WHEN** 维护者阅读 `QueryEngine` 构造与字段定义
- **THEN** 横切 service 依赖以 `RuntimeServices` 或等效依赖包表达，而不是以一组彼此独立的 service 字段散列

#### Scenario: 调用方按单项 service 覆盖测试依赖
- **WHEN** 测试或入口只需要替换某一个 service
- **THEN** app runtime 装配仍支持按单项 override 合并默认依赖包，而不要求调用方手动构造完整依赖集合

#### Scenario: ToolService 保持工具层实现归属
- **WHEN** runtime services 依赖包包含 tool service 引用
- **THEN** 这只表达 query runtime 的依赖需求，不要求 `ToolService` 文件迁移出 tools 层

### Requirement: Tool service internals MUST separate catalog and execution boundaries
工具服务内部 MUST 区分工具目录能力与工具执行能力，使工具来源、metadata/schema 暴露和执行分发可以独立演进。

#### Scenario: 读取工具服务实现
- **WHEN** 维护者阅读 `tools/service.ts`
- **THEN** 该文件主要组合工具 catalog 与 executor，而不是直接承载工具列表、metadata 转换和执行分发的全部细节

#### Scenario: 新增工具来源
- **WHEN** 系统新增一种工具来源或 metadata 暴露规则
- **THEN** 维护者主要修改工具 catalog 边界，而不是修改 query runtime 或工具执行分发逻辑

#### Scenario: 调整工具执行分发
- **WHEN** 系统调整 builtin、subagent 或 MCP 工具执行路由
- **THEN** 维护者主要修改工具 executor 边界，而不是修改工具 catalog 或 query runtime

### Requirement: Tool executor internals MUST separate dispatch and target execution boundaries
工具 executor 内部 MUST 区分 target dispatch、builtin/subagent execution 与 MCP execution，使不同工具目标的执行策略可以独立演进。

#### Scenario: 读取工具 executor 实现
- **WHEN** 维护者阅读 `tools/executor.ts`
- **THEN** 该文件主要根据工具 target 分发到专门 executor，而不是直接承载 builtin handler 解析和 MCP runner 调用的全部细节

#### Scenario: 调整 builtin 或 subagent 工具执行
- **WHEN** 系统调整 builtin 或 subagent 工具 handler 解析、preview 或 replay metadata 传递
- **THEN** 维护者主要修改 builtin executor 边界，而不是修改 MCP execution 或 query runtime

#### Scenario: 调整 MCP 工具执行
- **WHEN** 系统调整 MCP 工具调用、fallback 或 protected execution 包装
- **THEN** 维护者主要修改 MCP executor 边界，而不是修改 builtin execution 或 query runtime

### Requirement: MCP tool internals MUST separate config and protocol utilities from client registry runtime
MCP 工具内部 MUST 区分配置加载、协议/输出工具函数与 client/registry runtime，使配置格式、协议解析、输出归一化和进程生命周期可以独立演进。

#### Scenario: 调整 MCP 配置读取
- **WHEN** 系统调整 MCP server 配置默认值、路径解析或 enabled 过滤规则
- **THEN** 维护者主要修改 MCP config 边界，而不是修改 JSON-RPC client 生命周期或 registry retry 逻辑

#### Scenario: 调整 MCP 协议解析或输出归一化
- **WHEN** 系统调整 tools/list 解析、tools/call 结果归一化或结构化失败输出
- **THEN** 维护者主要修改 MCP protocol/output 边界，而不是修改配置加载或 registry cache 逻辑

#### Scenario: 读取 MCP public API
- **WHEN** 维护者阅读 `tools/mcp.ts`
- **THEN** 该文件主要表达 MCP client、registry 和 public API 组合，而不是直接承载配置解析与输出归一化的全部细节

### Requirement: MCP runtime internals MUST separate client lifecycle registry cache and public API facade
MCP runtime 内部 MUST 区分 server client lifecycle、registry/cache/runner 与 public API facade，使外部进程通信、工具注册缓存和工具总线入口可以独立演进。

#### Scenario: 调整 MCP server lifecycle
- **WHEN** 系统调整 MCP server 启动、初始化、JSON-RPC request、stdout frame parse 或 close 行为
- **THEN** 维护者主要修改 MCP client 边界，而不是修改 registry cache 或 public API facade

#### Scenario: 调整 MCP registry 或 retry
- **WHEN** 系统调整 MCP 工具 alias、registration cache、retry 或 call observability
- **THEN** 维护者主要修改 MCP registry 边界，而不是修改 client lifecycle 或 tool executor

#### Scenario: 读取 MCP public API
- **WHEN** 维护者阅读 `tools/mcp.ts`
- **THEN** 该文件主要表达 active registry 装配与 public API，而不是直接承载 client lifecycle 和 registry runner 的全部细节

### Requirement: Security tool internals MUST separate policy approval manager and tool facade boundaries
Security 工具内部 MUST 区分 policy 规则评估、approval 持久化、manager 编排与 tool facade，使安全策略、审批状态和工具对外契约可以独立演进。

#### Scenario: 调整安全策略规则
- **WHEN** 系统调整默认 policy、policy merge 或 rule match 逻辑
- **THEN** 维护者主要修改 security policy 边界，而不是修改 approval store 或 tool facade

#### Scenario: 调整 approval 持久化
- **WHEN** 系统调整 approval 文件读取、归一化或保存逻辑
- **THEN** 维护者主要修改 approval store 边界，而不是修改 policy evaluate 或 tool schemas

#### Scenario: 读取 security public facade
- **WHEN** 维护者阅读 `tools/security.ts`
- **THEN** 该文件主要表达 security tool schema 与 public handlers，而不是直接承载 policy、approval store 和 gate 编排的全部细节

### Requirement: Team tool internals MUST separate store protocol manager and tool facade boundaries
Team 工具内部 MUST 区分 team store、protocol 语义、manager 编排与 tool facade，使消息投递、协议请求和对外契约可以独立演进。

#### Scenario: 调整团队持久化
- **WHEN** 系统调整 teammates / requests 读取、归一化或保存逻辑
- **THEN** 维护者主要修改 team store 边界，而不是修改 protocol 语义或 tool schemas

#### Scenario: 调整 team protocol 语义
- **WHEN** 系统调整 request_id、pending/approved/rejected 流转或消息构造
- **THEN** 维护者主要修改 team protocol 边界，而不是修改 store 或 tool facade

#### Scenario: 读取 team public facade
- **WHEN** 维护者阅读 `tools/team.ts`
- **THEN** 该文件主要表达 team tool schema 与 public handlers，而不是直接承载 store、protocol 和流程编排的全部细节

### Requirement: Worktree tool internals MUST separate store runner manager and tool facade boundaries
Worktree 工具内部 MUST 区分 record store、command/git runner、manager 编排与 tool facade，使执行车道持久化、命令运行和工具对外契约可以独立演进。

#### Scenario: 调整 worktree 持久化
- **WHEN** 系统调整 worktree index、event log、record normalize 或 closeout normalize 逻辑
- **THEN** 维护者主要修改 worktree store 边界，而不是修改 command runner 或 tool schemas

#### Scenario: 调整 command 或 dirty guard 检测
- **WHEN** 系统调整 shell command 执行、git metadata 检测或 dirty files 查询
- **THEN** 维护者主要修改 worktree runner 边界，而不是修改 store 或 tool facade

#### Scenario: 读取 worktree public facade
- **WHEN** 维护者阅读 `tools/worktree.ts`
- **THEN** 该文件主要表达 worktree tool schema 与 public handlers，而不是直接承载 store、runner 和流程编排的全部细节

### Requirement: Task board internals MUST separate store manager and tool facade boundaries
任务面板工具内部 MUST 区分任务持久化 store、任务流程 manager 与 tool facade，使任务状态机、claim 流程、worktree 同步和对外工具契约可以独立演进。

#### Scenario: 读取 task board public facade
- **WHEN** 维护者阅读 `tools/task-board.ts`
- **THEN** 该文件主要表达 task tool schema 与 public handlers，而不是直接承载任务读写、状态迁移、claim 或 worktree sync 的全部细节

#### Scenario: 调整任务持久化或依赖清理
- **WHEN** 系统调整 `.tasks/task_*.json` 的兼容读取、保存或 completed 后的 blockedBy 清理逻辑
- **THEN** 维护者主要修改 task store 边界，而不是修改 tool facade 或 autonomy / worktree 调用方

#### Scenario: 调整任务状态机或 claim 流程
- **WHEN** 系统调整 task status transition、unclaimed scan、claim 或 worktree state sync
- **THEN** 维护者主要修改 task manager 边界，而不是修改 task store 或 tool schema

### Requirement: Scheduler internals MUST separate cron store manager and tool facade boundaries
Scheduler 工具内部 MUST 区分 cron 语义、持久化 store、调度 manager 与 tool facade，使 cron 匹配、持久化兼容、tick 编排和对外契约可以独立演进。

#### Scenario: 读取 scheduler public facade
- **WHEN** 维护者阅读 `tools/scheduler.ts`
- **THEN** 该文件主要表达 schedule tool schema、默认 manager 和兼容导出，而不是直接承载 cron 解析、文件读写和 tick 编排的全部细节

#### Scenario: 调整 cron 语义
- **WHEN** 系统调整 cron parse、validate 或 match 逻辑
- **THEN** 维护者主要修改 scheduler cron 边界，而不是修改 store 或 tool facade

#### Scenario: 调整 schedule 持久化或 tick 编排
- **WHEN** 系统调整 `.schedule` 持久化兼容、notification queue 或 tick 行为
- **THEN** 维护者主要修改 scheduler store 或 manager 边界，而不是修改 cron 工具或 tool schema

### Requirement: Background task internals MUST separate runner manager and tool facade boundaries
后台任务工具内部 MUST 区分异步进程 runner、状态 manager 与 tool facade，使进程启动、状态流转、通知回流和对外契约可以独立演进。

#### Scenario: 读取 background task public facade
- **WHEN** 维护者阅读 `tools/background-task.ts`
- **THEN** 该文件主要表达 background tool schema、默认 manager 和兼容导出，而不是直接承载 spawn、状态流转和通知队列的全部细节

#### Scenario: 调整后台进程启动方式
- **WHEN** 系统调整后台任务子进程启动或进程句柄协议
- **THEN** 维护者主要修改 background runner 边界，而不是修改 manager 或 tool schema

#### Scenario: 调整后台任务状态或通知回流
- **WHEN** 系统调整后台任务 stdout/stderr 聚合、状态流转、通知 drain 或 observability 编排
- **THEN** 维护者主要修改 background manager 边界，而不是修改 runner 或 tool facade

### Requirement: Subagent internals MUST separate executor manager and tool facade boundaries
子代理工具内部 MUST 区分模型/tool-calling executor、生命周期 manager 与 tool facade，使模型调用、状态流转、通知回流和对外契约可以独立演进。

#### Scenario: 读取 subagent public facade
- **WHEN** 维护者阅读 `tools/subagent.ts`
- **THEN** 该文件主要表达 subagent tool schema、默认 manager 和兼容导出，而不是直接承载生命周期状态表、模型执行循环和通知编排的全部细节

#### Scenario: 调整子代理模型执行方式
- **WHEN** 系统调整子代理模型选择、fallback 或 tool loop 行为
- **THEN** 维护者主要修改 subagent executor 边界，而不是修改 manager 或 tool schema

#### Scenario: 调整子代理生命周期或通知
- **WHEN** 系统调整子代理 spawn/send/wait/close、状态流转、notification drain 或 observability 编排
- **THEN** 维护者主要修改 subagent manager 边界，而不是修改 executor 或 tool facade

### Requirement: Delivery internals MUST separate plan runner report store and public facade boundaries
Delivery 内部 MUST 区分 stage plan、command runner、report store 与 public facade，使验证阶段选择、执行策略、报告持久化和工具输出可以独立演进。

#### Scenario: 调整验证阶段计划
- **WHEN** 系统调整 package script 探测、stage 列表或 skip 条件
- **THEN** 维护者主要修改 delivery plan 边界，而不是修改 command runner 或 report store

#### Scenario: 调整执行或失败分类
- **WHEN** 系统调整 command execution、retry、failure classify 或 stage observability
- **THEN** 维护者主要修改 delivery runner 边界，而不是修改 plan 或 tool facade

#### Scenario: 读取 delivery public facade
- **WHEN** 维护者阅读 `src/delivery.ts`
- **THEN** 该文件主要表达 public validation 编排与 tool-facing handlers，而不是直接承载 plan、runner 和 report store 的全部细节

### Requirement: QueryModel internals MUST separate request fallback recovery and public orchestration boundaries
QueryModel 内部 MUST 区分 request、fallback、recovery 与 public orchestration，使请求构造、模型降级、恢复动作和主编排可以独立演进。

#### Scenario: 调整模型请求构造
- **WHEN** 系统调整 request messages、OpenAI request shape 或 response 归一化
- **THEN** 维护者主要修改 query model request 边界，而不是修改 fallback 或 recovery 边界

#### Scenario: 调整模型 fallback
- **WHEN** 系统调整 fallback model selection、fallback retry 或 usage finalize
- **THEN** 维护者主要修改 query model fallback 边界，而不是修改 request message 构造或 recovery selector

#### Scenario: 读取 QueryModel public orchestration
- **WHEN** 维护者阅读 `runtime/query-model.ts`
- **THEN** 该文件主要表达 public `requestQueryModel` 编排，而不是直接承载 request、fallback 和 recovery 的全部细节

### Requirement: QueryToolStage internals MUST separate hooks executor task sync and stage orchestration boundaries
QueryToolStage 内部 MUST 区分 hooks、executor、task sync 与 stage orchestration，使 hook 扩展点、单次工具执行、任务联动和阶段遍历可以独立演进。

#### Scenario: 调整工具 hook 行为
- **WHEN** 系统调整 PreToolUse / PostToolUse 调用或 hook blocked output
- **THEN** 维护者主要修改 query tool hooks 边界，而不是修改 task sync 或 stage orchestration

#### Scenario: 调整单次工具执行
- **WHEN** 系统调整 tool_call / tool_result observability、execution context 或 security blocked event
- **THEN** 维护者主要修改 query tool executor 边界，而不是修改 hooks 或 task sync

#### Scenario: 读取 QueryToolStage orchestration
- **WHEN** 维护者阅读 `runtime/query-tools.ts`
- **THEN** 该文件主要表达 tool calls 遍历与阶段编排，而不是直接承载 hook、executor 和 task sync 的全部细节

### Requirement: QueryFinalization internals MUST separate round counter delivery finalizer stop hook and public facade boundaries
QueryFinalization 内部 MUST 区分 round counter、delivery finalizer、stop hook runner 与 public facade，使轮次状态、自动交付验证、停止扩展点和对外 API 可以独立演进。

#### Scenario: 调整轮次计数
- **WHEN** 系统调整 assistant-only 或 tool-driven round 的 `roundsWithoutTodo` 更新
- **THEN** 维护者主要修改 round counter 边界，而不是修改 delivery 或 stop hook 边界

#### Scenario: 调整自动交付验证收尾
- **WHEN** 系统调整 auto delivery 触发或摘要回填
- **THEN** 维护者主要修改 delivery finalizer 边界，而不是修改 Stop hook runner

#### Scenario: 读取 QueryFinalization public facade
- **WHEN** 维护者阅读 `runtime/query-finalization.ts`
- **THEN** 该文件主要表达 public finalization API，而不是直接承载 round counter、delivery 和 stop hook 的全部细节

### Requirement: Runtime closeout internals MUST separate engine round notification prompt and service session helper boundaries
Runtime 剩余收口 MUST 区分 QueryEngine round state、notification formatter / recorder、user prompt submit 和 service session helper 边界，使主循环编排、通知注入、用户提交入口和 HTTP session 适配可以独立演进。

#### Scenario: 调整 QueryEngine round metadata
- **WHEN** 系统调整 round 初始化、latest user 摘要或 loop_start metadata
- **THEN** 维护者主要修改 QueryEngine round 边界，而不是修改模型、工具或 finalization 阶段

#### Scenario: 调整通知格式化或观测
- **WHEN** 系统调整 scheduled/subagent/background/team notification 的文案或事件记录
- **THEN** 维护者主要修改 notification formatter / recorder 边界，而不是修改 query preparation orchestration

#### Scenario: 调整 HTTP session state helper
- **WHEN** 系统调整 session summary、record 创建或排序规则
- **THEN** 维护者主要修改 service session helper 边界，而不是修改 query runtime 或 HTTP 路由主体

### Requirement: CLI MUST provide a local multi-line composer mode
CLI MUST 提供本地多行 composer 模式，让用户可以先草拟、预览，再把完整草稿一次性提交给模型。

#### Scenario: User enters composer mode
- **WHEN** 用户输入 `/compose`
- **THEN** 系统进入草稿模式
- **AND** 后续普通文本输入只追加到 draft

#### Scenario: User previews the current draft
- **WHEN** 用户输入 `/preview`
- **THEN** 系统展示当前 draft 内容、行数和摘要
- **AND** 不调用模型

#### Scenario: User sends the current draft
- **WHEN** 用户输入 `/send`
- **THEN** 系统把当前 draft 作为一次完整 prompt 发给模型
- **AND** draft 在发送后被清空

#### Scenario: User cancels the current draft
- **WHEN** 用户输入 `/cancel`
- **THEN** 系统丢弃当前 draft
- **AND** 退出草稿模式

### Requirement: Composer mode MUST be reflected in terminal interaction surfaces
Composer 模式 MUST 在 CLI / TUI 的 prompt、footer 或控制面中明确展示，避免用户误以为当前输入会直接发送。

#### Scenario: Prompt reflects composer state
- **WHEN** 用户已经进入 composer 模式
- **THEN** prompt 或 footer 显示 draft line count 或 composer active 状态

### Requirement: Composer mode MUST not trigger non-explicit local shortcuts
在 composer 模式中，普通文本输入 MUST 不触发审批快捷词等隐式本地动作，除非用户明确使用 slash command。

#### Scenario: Approval shortcut text inside draft
- **WHEN** 用户处于 composer 模式并输入 `approve`、`批准`、`yes`
- **THEN** 文本被追加到 draft
- **AND** 不执行审批动作

### Requirement: Composer draft editing MUST preserve intentional blank lines and support local rollback
在 composer 模式中，CLI / TUI MUST 保留用户有意输入的空行，并提供本地草稿回退能力，避免长草稿只能追加不能修正。

#### Scenario: Blank line is preserved while drafting
- **WHEN** 用户已进入 composer 模式并提交一个空行
- **THEN** 系统把该空行追加到 draft
- **AND** 后续 `/preview` 或 `/send` 能看到该空行仍然存在

#### Scenario: User removes the latest draft lines
- **WHEN** 用户输入 `/pop` 或 `/pop 3`
- **THEN** 系统移除最近 1 行或 3 行 draft
- **AND** 返回最新 draft 的行数和字符数摘要

### Requirement: Composer surfaces MUST provide structured draft visibility
Composer 相关交互面 MUST 提供结构化 draft 可视能力，而不只是一个抽象“已进入草稿模式”的状态提示。

#### Scenario: Preview shows draft structure
- **WHEN** 用户输入 `/preview`
- **THEN** 输出展示 line count、char count 和有结构的 draft 内容

#### Scenario: TUI exposes a dedicated draft panel
- **WHEN** 用户在 TUI 中处于 composer 模式
- **THEN** 仪表盘展示独立 draft panel
- **AND** 该 panel 至少显示草稿摘要与最近若干行内容

### Requirement: CLI and TUI MUST provide ergonomic local session selection
CLI / TUI MUST 提供顺手的本地 session 选择方式，避免用户只能依赖完整 session id 进行切换。

#### Scenario: User switches by index or latest selector
- **WHEN** 用户输入 `/use 2` 或 `/use latest`
- **THEN** 系统切换到对应 session
- **AND** 返回明确的当前会话反馈

#### Scenario: User switches by unique session id prefix
- **WHEN** 用户输入 `/use abc123`
- **THEN** 若该前缀唯一命中某个 session id，系统切换到该 session
- **AND** 若命中多个 session，则返回歧义错误

### Requirement: CLI and TUI MUST support sequential session navigation
CLI / TUI MUST 支持按当前 session 列表顺序前后循环切换，减少多会话场景中的跳转成本。

#### Scenario: User moves to next session
- **WHEN** 用户输入 `/next`
- **THEN** 系统切换到当前顺序中的下一个 session
- **AND** 若当前已在最后一个 session，则循环回第一个

#### Scenario: User moves to previous session
- **WHEN** 用户输入 `/prev`
- **THEN** 系统切换到当前顺序中的上一个 session
- **AND** 若当前已在第一个 session，则循环回最后一个

### Requirement: Session surfaces MUST expose clear navigation affordances
会话相关交互面 MUST 明确展示 session 序号、active 状态和切换提示，而不是只展示被动状态信息。

#### Scenario: Sessions list exposes selection hints
- **WHEN** 用户查看 `/sessions`
- **THEN** 输出显示 session index、active marker、busy/idle 和 message count

#### Scenario: TUI sessions panel exposes navigation hints
- **WHEN** 用户查看 TUI 仪表盘
- **THEN** Sessions panel 与 controls / footer 显示 `/use`、`/next`、`/prev` 相关提示

### Requirement: TUI MUST expose lightweight keyboard shortcuts for high-frequency local actions
TUI MUST 提供轻量键盘快捷键，让高频本地动作不再只能依赖 slash command。

#### Scenario: User cycles sessions with keyboard shortcuts
- **WHEN** 用户在 TUI 中按下 `Ctrl+N` 或 `Ctrl+P`
- **THEN** 系统分别切换到下一个或上一个 session
- **AND** 不进入模型请求链路

#### Scenario: User redraws or cancels draft with keyboard shortcuts
- **WHEN** 用户在 TUI 中按下 `Ctrl+L` 或在草稿模式下按下 `Esc`
- **THEN** 系统分别执行重绘或取消草稿
- **AND** 不进入模型请求链路

### Requirement: TUI keyboard shortcuts MUST not hijack active prompt content entry
TUI 键盘快捷键 MUST 不得在用户正在输入正文内容时劫持输入，避免破坏 prompt 编辑。

#### Scenario: Prompt buffer is not empty
- **WHEN** 用户已经在 prompt 中输入了正文内容
- **THEN** 全局快捷键不应触发本地动作
- **AND** 用户继续完成当前输入

### Requirement: TUI surfaces MUST advertise available keyboard shortcuts
TUI 的交互面 MUST 明确展示可用快捷键，避免功能隐藏。

#### Scenario: User views TUI dashboard
- **WHEN** 用户查看 TUI 主界面
- **THEN** banner、controls 或 footer 至少一处展示快捷键提示

### Requirement: CLI and TUI MUST provide scoped help topics for common local workflows
CLI / TUI MUST 提供按工作流分层的帮助主题，避免所有本地命令只通过单一长列表暴露。

#### Scenario: User requests draft help
- **WHEN** 用户输入 `/help draft`
- **THEN** 输出聚焦 composer / draft 相关命令
- **AND** 至少包含一条可直接执行的示例

#### Scenario: User requests session help
- **WHEN** 用户输入 `/help sessions`
- **THEN** 输出聚焦 session 选择、切换与导航命令
- **AND** 不要求用户先阅读整份全量命令清单

### Requirement: CLI and TUI MUST expose a local workflow switcher for surface-level modes
CLI / TUI MUST 提供本地 workflow switcher，让用户可以在通用 Agent surface 与 draw-oriented surface 之间切换，而不必分散依赖不同命令入口。

#### Scenario: User switches the local workflow surface
- **WHEN** 用户输入 `/workflow draw` 或 `/workflow agent`
- **THEN** 系统切换当前本地 workflow surface
- **AND** 不进入模型请求链路

#### Scenario: Workflow-aware surfaces reflect the active local mode
- **WHEN** 用户已经切换到某个本地 workflow
- **THEN** CLI / TUI 的 prompt、banner、guide、palette 或 footer 至少一处反映当前 workflow
- **AND** 用户可以通过统一入口切回其他 workflow

### Requirement: TUI guide surfaces MUST prioritize context-relevant actions
TUI 的 guide / controls 面 MUST 优先展示和当前状态最相关的本地动作，而不是把所有命令长期平铺在同一个面板里。

#### Scenario: Composer mode is active in TUI
- **WHEN** 用户在 TUI 中处于 composer 模式
- **THEN** guide 面优先展示 `/preview`、`/send`、`/pop`、`/cancel` 等草稿动作
- **AND** 明确给出 help 或快捷键入口

#### Scenario: Default TUI mode is active
- **WHEN** 用户在 TUI 中未处于 composer 模式
- **THEN** guide 面优先展示帮助入口、会话导航和状态查看类动作
- **AND** 保持信息密度紧凑，不依赖超长静态命令墙

### Requirement: TUI MUST expose a dedicated keyboard entry for local help
TUI MUST 提供专用本地 help 快捷入口，让用户无需输入完整 slash command 即可查看帮助。

#### Scenario: Prompt buffer is empty
- **WHEN** 用户在 TUI 中按下 `Ctrl+G`
- **THEN** 系统展示本地帮助输出
- **AND** 不进入模型请求链路

#### Scenario: Prompt buffer is not empty
- **WHEN** 用户已经在 prompt 中输入正文内容
- **THEN** `Ctrl+G` 不应抢占当前正文输入
- **AND** 用户可以继续完成当前输入

### Requirement: CLI and TUI MUST provide local command completion for high-frequency control commands
交互 CLI / TUI MUST 提供本地命令补全，降低 slash command 与常见参数的输入成本。

#### Scenario: User completes a help topic
- **WHEN** 用户输入 `/help d` 并触发补全
- **THEN** 系统补全为 `/help draft` 或给出对应候选
- **AND** 不进入模型请求链路

#### Scenario: User completes a session selector
- **WHEN** 用户输入 `/use ` 并触发补全
- **THEN** 系统给出可用 session index、`latest` 或已知 session id 候选
- **AND** 只使用本地 session 状态

### Requirement: CLI and TUI MUST expose a local command palette for high-frequency actions
CLI / TUI MUST 提供本地 command palette，让用户不必先记住完整命令再输入。

#### Scenario: User opens the command palette
- **WHEN** 用户输入 `/palette` 或在 TUI 中触发 palette 快捷入口
- **THEN** 系统展示高频本地动作候选
- **AND** 不进入模型请求链路

#### Scenario: User fuzzy-searches palette candidates
- **WHEN** 用户输入 `/palette review`
- **THEN** 系统返回与该查询最相关的本地候选
- **AND** 候选可以来自 workflow、help、session、transcript 或 runtime 控制面

#### Scenario: User scans grouped palette results
- **WHEN** 用户查看 palette 结果
- **THEN** 系统按稳定分组展示候选
- **AND** 同组候选保持局部相关度排序，而不是完全无结构的长列表

### Requirement: Local command palette MUST support direct candidate execution
本地 command palette MUST 支持直接执行候选，避免用户找到候选后还要再次完整输入命令。

#### Scenario: User opens one palette candidate by index
- **WHEN** 用户输入 `/palette open 2`
- **THEN** 系统执行最近一次 palette 结果中的第 2 个候选对应的本地动作
- **AND** 返回明确反馈，说明实际执行了哪个本地命令

#### Scenario: User references an unknown palette result index
- **WHEN** 用户输入 `/palette open 9`
- **THEN** 系统返回稳定错误
- **AND** 提示用户先重新运行 `/palette`

### Requirement: TUI MUST provide a dedicated keyboard entry for the local command palette
TUI MUST 提供专用 palette 快捷入口，让用户无需手动输入 `/palette`。

#### Scenario: Prompt buffer is empty
- **WHEN** 用户在 TUI 中按下 `Ctrl+K`
- **THEN** 系统展示本地 palette
- **AND** 不进入模型请求链路

#### Scenario: Prompt buffer is not empty
- **WHEN** 用户已经在 prompt 中输入正文内容
- **THEN** `Ctrl+K` 不应抢占当前正文输入
- **AND** 用户可以继续完成当前输入

### Requirement: TUI local command palette MUST expose a dedicated selection surface
TUI 本地 command palette MUST 提供独立的选择面，而不是只输出静态文本结果。

#### Scenario: User opens the palette panel
- **WHEN** 用户通过 `/palette` 或 `Ctrl+K` 打开本地 palette
- **THEN** TUI 展示顶部 `Command Bar`
- **AND** `Command Bar` 与 `Palette Results` 采用共享的轻量居中浮层布局，而不是一个全宽一个局部居中

#### Scenario: User moves the current selection
- **WHEN** palette panel 已打开
- **THEN** 用户可以通过 `Up` / `Down` 或 `Ctrl+N` / `Ctrl+P` 切换当前选中候选
- **AND** 不进入模型请求链路

#### Scenario: User scans grouped compact palette results
- **WHEN** palette 已打开且用户查看当前候选
- **THEN** TUI 在结果中明确展示分组与 query 命中
- **AND** command bar 展示当前选中候选的 preview summary
- **AND** overlay 以更紧凑的命令优先结果行和精简 keys hint 展示当前可执行动作

### Requirement: TUI local command palette MUST support query submission and direct execution
TUI 本地 command palette MUST 支持本地 query 刷新与当前选中项直接执行。

#### Scenario: User types while palette is open
- **WHEN** palette 已打开且用户输入普通字符、`backspace` 或 `delete`
- **THEN** 系统即时刷新本地 palette query
- **AND** 不进入模型请求链路

#### Scenario: User executes the selected palette candidate
- **WHEN** palette 已打开且用户按下回车
- **THEN** 系统执行当前选中候选对应的本地动作
- **AND** 返回明确反馈，说明实际执行了哪个本地命令

### Requirement: CLI and TUI MUST provide local transcript browsing for the active session
CLI / TUI MUST 提供当前 session 的本地 transcript 浏览能力，避免用户只能查看最近几条对话。

#### Scenario: User enters transcript history mode
- **WHEN** 用户输入 `/history`
- **THEN** 系统展示当前 session transcript 的结构化窗口
- **AND** 明确给出翻页、展开或返回 tail 的下一步入口

#### Scenario: User jumps to transcript edges
- **WHEN** 用户输入 `/history first` 或 `/history last`
- **THEN** 系统分别跳到最早或最新的 transcript window
- **AND** 保持同一套本地浏览状态

#### Scenario: User returns to live tail mode
- **WHEN** 用户输入 `/tail`
- **THEN** 系统回到最近消息 tail 视图
- **AND** TUI Conversation panel 恢复 live tail 展示

### Requirement: Local transcript browsing MUST support search and single-entry expansion
本地 transcript 浏览 MUST 支持搜索匹配和单条消息展开，避免长会话只能粗略翻页。

#### Scenario: User searches the current transcript
- **WHEN** 用户输入 `/search bug`
- **THEN** 系统返回命中该查询的 transcript 条目摘要
- **AND** 输出至少包含可用于展开单条结果的 entry index

#### Scenario: User moves across search matches
- **WHEN** 用户已经进入 transcript search 状态并输入 `/search next` 或 `/search prev`
- **THEN** 系统切换当前 match focus
- **AND** 保持相同 query 的本地搜索结果上下文

#### Scenario: User expands one transcript entry
- **WHEN** 用户输入 `/peek 12`
- **THEN** 系统展示第 12 条 transcript entry 的完整内容
- **AND** 保留该条 entry 的 role、索引和基本摘要

#### Scenario: User moves across adjacent expanded entries
- **WHEN** 用户已经处于 transcript peek 状态并输入 `/peek next` 或 `/peek prev`
- **THEN** 系统切换到相邻 transcript entry
- **AND** 保持展开视图而不是退回列表

### Requirement: CLI and TUI MUST expose local feature disclosure governance

CLI / TUI 本地交互面 MUST 提供功能披露治理入口，列出公开本地功能、隐藏功能状态、实验或 reserved gap 状态，避免维护者只能从源码中推断是否存在隐藏命令、隐藏彩蛋或 beta-only surface。

#### Scenario: User inspects local feature disclosure
- **WHEN** 用户输入 `/features`
- **THEN** 系统展示本地 feature disclosure 清单
- **AND** 清单明确展示当前隐藏命令、隐藏彩蛋和 beta-only surface 的状态

#### Scenario: Feature disclosure is discoverable
- **WHEN** 用户查看 `/help`、`/help runtime` 或使用 `/palette feature`
- **THEN** 系统提供可发现的 `/features` 入口

#### Scenario: Hidden surfaces are not silently enabled
- **WHEN** 仓库没有实现隐藏命令、隐藏彩蛋或 beta-only header surface
- **THEN** `/features` MUST 明确报告这些能力为 `none registered` 或 `reserved_gap`
- **AND** 不得把未实现的隐藏能力伪装成可用功能

