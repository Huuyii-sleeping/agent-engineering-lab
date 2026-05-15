# 仓库通用架构术语说明

这份文档沉淀整个仓库里反复出现的 Agent / Runtime / Platform 相关名词。

目的不是讲实现细节，而是先把词讲清楚，避免在讨论架构、PRD、OpenSpec、README 和代码时各说各话。

统一格式：

- 是什么：这个词本身在说什么
- 为什么需要：它解决什么问题
- 在本仓库里对应什么：当前代码里大致落在哪
- 当前状态：`已有` / `部分具备` / `未实现`

## 运行时与生命周期

### bootstrap

- 是什么：程序启动时的初始化流程，用来把配置、模型客户端、服务、工具和运行时装配起来。
- 为什么需要：把“启动准备”和“实际执行”分开，减少入口散落初始化逻辑。
- 在本仓库里对应什么：`apps/agent-cli/src/bootstrap/app-runtime.ts`
- 当前状态：`部分具备`

### runtime

- 是什么：Agent 真正开始工作后的核心执行环境，负责模型请求、消息状态、工具调用、通知注入和回合推进。
- 为什么需要：把“Agent 怎么跑”收敛到稳定内核，而不是散在 CLI、TUI、HTTP 入口里。
- 在本仓库里对应什么：`apps/agent-cli/src/runtime/*`，核心入口是 `query-engine.ts`
- 当前状态：`已有`

### host

- 是什么：承载 runtime 的长期对象，负责 session、事件流、生命周期和统一服务出口。
- 为什么需要：让多个入口共用同一个大脑，而不是每个入口自己起一套 runtime。
- 在本仓库里对应什么：`apps/agent-cli/src/host/agent-host.ts`，由 `agent-cli daemon`、HTTP service、TUI 和 MCP server 复用。
- 当前状态：`已有`

### daemon

- 是什么：长期驻留后台的宿主进程。CLI、TUI、Web 或其他客户端连接它，而不是各自启动一套 Agent。
- 为什么需要：支撑长会话、跨终端恢复、远程接入和统一事件流。
- 在本仓库里对应什么：`apps/agent-cli/src/entrypoints/daemon.ts`、`daemon-lock.ts`、`daemon-status.ts` 以及复用同一 host 的 HTTP service。
- 当前状态：`已有`

### session

- 是什么：一次持续对话的上下文，包含消息历史、运行时状态、活跃任务和本轮副作用信息。
- 为什么需要：没有 session，就无法持续对话、恢复上下文或做会话级工具编排。
- 在本仓库里对应什么：`apps/agent-cli/src/service-api/sessions.ts` 和 `AgentService` 内部 session 管理
- 当前状态：`已有`

### session persistence

- 是什么：把 session 写入磁盘或数据库，而不是只放在进程内存里。
- 为什么需要：进程重启、终端关闭或客户端重连后还能恢复会话。
- 在本仓库里对应什么：`apps/agent-cli/src/service-api/session-store.ts` 会把 session 索引和单 session 状态落到 `.sessions/`，由 `AgentHost` 启动时恢复。
- 当前状态：`已有`

## 通信与入口

### entrypoint

- 是什么：程序暴露给用户或外部系统的启动入口。
- 为什么需要：不同使用方式要接到同一套核心能力上。
- 在本仓库里对应什么：`apps/agent-cli/src/entrypoints/*`
- 当前状态：`已有`

### bridge

- 是什么：不同客户端和 runtime 之间的桥接面，通常提供工具、会话、事件或聊天能力。
- 为什么需要：让 UI、脚本、服务端调用不直接耦合内部实现。
- 在本仓库里对应什么：`AgentService.bridgeManifest()` 和 `/bridge`、`/events` 这类接口
- 当前状态：`部分具备`

### remote-control

- 是什么：从当前终端之外的客户端或远端系统控制 Agent 的能力。
- 为什么需要：支撑 Web Console、其他本地进程或未来远程控制面。
- 在本仓库里对应什么：HTTP service、MCP server、bridge 是基础，但没有独立 remote control 产品面。
- 当前状态：`部分具备`

### transport

- 是什么：消息和事件在不同组件之间传输的方式。
- 为什么需要：CLI、HTTP、MCP、事件流各自协议不同，但都需要稳定传输层。
- 在本仓库里对应什么：stdio、HTTP、SSE 风格事件流、MCP JSON-RPC
- 当前状态：`已有`

### SSE

- 是什么：Server-Sent Events，服务端持续向客户端推送事件的简单协议。
- 为什么需要：适合状态更新、事件通知、日志流，不必先引入 WebSocket。
- 在本仓库里对应什么：`AgentService` 的 `/events` 事件流
- 当前状态：`已有`

### WebSocket reconnect

- 是什么：连接断开后自动重连并恢复订阅的机制。
- 为什么需要：长时间运行的控制台、远程前端和 daemon 场景都依赖它保证韧性。
- 在本仓库里对应什么：当前没有独立 websocket reconnect 层。
- 当前状态：`未实现`

### MCP

- 是什么：Model Context Protocol，用标准协议把外部工具暴露给模型调用。
- 为什么需要：让 Agent 可以统一接外部工具，同时也可以把自己暴露给别的宿主使用。
- 在本仓库里对应什么：`apps/agent-cli/src/tools/mcp-*.ts` 和 `src/entrypoints/mcp-server.ts`
- 当前状态：`已有`

## 工具与调度

### tool

- 是什么：模型可调用的一项具体能力，比如 `read_file`、`write_file`、`task_create`。
- 为什么需要：让模型通过结构化接口与文件系统、任务系统、memory、MCP 服务交互。
- 在本仓库里对应什么：`apps/agent-cli/src/tools/*`
- 当前状态：`已有`

### tool catalog

- 是什么：系统里有哪些工具、它们长什么样、暴露给模型什么 schema 的注册表。
- 为什么需要：统一对外声明能力，而不是每个入口自己拼工具列表。
- 在本仓库里对应什么：`apps/agent-cli/src/tools/catalog.ts`
- 当前状态：`已有`

### tool executor

- 是什么：真正接住工具名和参数并执行的层。
- 为什么需要：把“声明工具”和“执行工具”解耦，也便于接权限、观测和重放控制。
- 在本仓库里对应什么：`apps/agent-cli/src/tools/executor.ts`、`builtin-executor.ts`、`mcp-executor.ts`
- 当前状态：`已有`

### tool scheduler

- 是什么：决定一轮多个工具调用如何排序、分组、并发和加锁的调度层。
- 为什么需要：工具数量一多，只靠简单顺序执行会慢；盲目并发又会把写操作和状态操作弄乱。
- 在本仓库里对应什么：当前一轮工具调用主要在 `runtime/query-tools.ts` 里顺序执行，还没有独立 scheduler。
- 当前状态：`部分具备`

### serial

- 是什么：工具一个接一个按顺序执行。
- 为什么需要：最安全，尤其适合写文件、状态迁移、审批和任务更新这类有副作用的操作。
- 在本仓库里对应什么：当前默认执行方式
- 当前状态：`已有`

### parallel

- 是什么：多个工具在同一轮里并发执行。
- 为什么需要：读文件、纯查询类工具可以借此显著降低总耗时。
- 在本仓库里对应什么：运行时主链路还没有统一并发执行模型。
- 当前状态：`未实现`

### batch API

- 是什么：一次把一组工具调用交给调度层，由它决定如何执行，而不是只处理单个工具调用。
- 为什么需要：这是并发工具编排和高阶调度的基础。
- 在本仓库里对应什么：当前工具是逐个 call 处理，没有独立 batch contract。
- 当前状态：`未实现`

## 扩展机制

### skill

- 是什么：围绕某类任务的 prompt / workflow / 操作约束沉淀。
- 为什么需要：把“如何做某类任务”的经验变成可复用资产，而不是只存在对话里。
- 在本仓库里对应什么：`.codex/skills/*`、`load_skill`、`list_skills`
- 当前状态：`已有`

### plugin

- 是什么：可被系统发现、加载、启停的扩展模块，通常可以带来新工具、新 hook、新 UI 面或新 prompt 片段。
- 为什么需要：让扩展不必都改主仓库核心代码。
- 在本仓库里对应什么：当前有 skill 和 MCP 两类扩展，但没有统一 plugin 概念。
- 当前状态：`部分具备`

### plugin runtime

- 是什么：插件的发现、加载、生命周期、隔离和禁用机制。
- 为什么需要：没有 runtime，就只是“能 import 文件”，不是完整插件系统。
- 在本仓库里对应什么：当前还没有统一 plugin runtime。
- 当前状态：`未实现`

## 多代理与平台化

### subagent

- 是什么：主 Agent 派生出来的子执行单元，承担边界清晰的子任务。
- 为什么需要：控制上下文长度，拆分复杂任务，形成并行协作。
- 在本仓库里对应什么：`subagent_spawn`、`subagent_send`、`subagent_wait` 等工具及其运行时
- 当前状态：`已有`

### orchestrator

- 是什么：比单个 subagent 更高一层的统一编排器，负责任务分派、状态跟踪、回收结果和调度策略。
- 为什么需要：当系统进入多会话、多代理、多入口阶段，只靠主循环临时指挥会越来越乱。
- 在本仓库里对应什么：目前由 task、team、subagent、background、worktree 等能力共同承担一部分职责，还没有独立 orchestrator。
- 当前状态：`部分具备`

### swarm

- 是什么：多个 Agent 或 worker 形成协作网络，共同完成复杂任务。
- 为什么需要：把一个大任务拆成多个独立工作流并行推进。
- 在本仓库里对应什么：当前更接近本地多能力协作，还没有独立 swarm backend 或远端 swarm runtime。
- 当前状态：`部分具备`

### registry

- 是什么：记录当前有哪些工具、插件、远端后端、代理节点或服务可用的注册表。
- 为什么需要：平台一旦多入口、多插件、多后端，没有 registry 就很难统一发现能力。
- 在本仓库里对应什么：工具注册表已存在，但远端 agent / swarm / plugin registry 还没有统一化。
- 当前状态：`部分具备`

## 隔离与持久化

### worktree isolation

- 是什么：把高风险或并行任务放进独立工作目录或 Git worktree，避免互相污染。
- 为什么需要：让多任务并行时仍保持主工作区干净、可控、可回收。
- 在本仓库里对应什么：`worktree_*` 工具和 `.worktrees/*`
- 当前状态：`已有`

### persistence

- 是什么：把运行中产生的重要状态写到磁盘或其他持久存储。
- 为什么需要：重启后恢复、审计追踪、异步任务回流和跨轮次记忆都依赖持久化。
- 在本仓库里对应什么：`.memory`、`.tasks`、`.schedule`、`.security`、`.observability`、`.team`、`.worktrees`、`.transcripts`
- 当前状态：`已有`

## 如何使用

出现以下情况时，优先先翻这份文档：

- 讨论“当前仓库和外部 Agent 架构相比差什么”
- 写 PRD / OpenSpec / README，需要明确术语边界
- 讨论“该不该做 daemon / plugin runtime / orchestrator”
- 评审设计稿时，发现同一个词被不同人用成不同意思

如果某个名词已经进入 README、PRD、OpenSpec 或代码注释，请尽量与本文档保持一致；如果定义发生变化，应优先先更新这里。
