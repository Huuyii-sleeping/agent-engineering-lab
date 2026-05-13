# core-agent-loop Specification

## Purpose
定义 Agent 主循环、模型请求轮次、基础工具执行、运行时恢复和 CLI 交互基线，作为所有后续能力共享的统一执行骨架与兼容契约。
## Requirements
### Requirement: Agent loop SHALL handle tool-calling rounds deterministically
主循环 MUST 在每轮前支持自治轮询入口，并在不破坏既有工具调用契约的前提下处理统一工具路由，包括 native、subagent 与 MCP 外部工具。

#### Scenario: 同一轮内混合调用 native 与 MCP 工具
- **WHEN** 模型在同一轮工具调用中同时请求原生工具与 MCP 工具
- **THEN** 主循环按返回顺序执行统一 router，并将每个工具结果按既有 `role: tool` 契约回填

### Requirement: Bash tool MUST enforce execution safety constraints
`bash(command)` 工具 MUST 在执行前进行命令内容校验，MUST 拒绝被屏蔽的危险片段，MUST 执行 120 秒默认超时，且 MUST 将输出截断至最多 50,000 字符。

#### Scenario: 危险命令被拒绝
- **WHEN** `bash(command)` 接收到包含被屏蔽片段（`rm -rf /`、`sudo`、`shutdown`、`reboot`）的文本
- **THEN** 工具返回明确的拒绝错误，且不执行 shell 命令

#### Scenario: 长时间运行命令触发超时
- **WHEN** 命令执行超过 120 秒
- **THEN** 工具返回超时错误并终止对应进程

### Requirement: CLI session MUST provide stable prompt and exit behavior
CLI 入口 MUST 在每次输入循环显示固定提示符 `s01 >>`，并且在收到 `q`、`exit` 或空输入时 MUST 干净退出进程。

#### Scenario: 用户输入 q 退出
- **WHEN** 用户输入 `q`
- **THEN** CLI 循环直接退出，且不触发模型调用或工具执行

#### Scenario: 用户输入正常请求
- **WHEN** 用户输入非空且非退出关键字的文本
- **THEN** CLI 将请求送入 agent loop，并输出 assistant 的结果

### Requirement: Agent loop SHALL support centralized runtime configuration
主循环及其核心工具 MUST 通过统一配置入口读取关键运行参数（如超时、阈值、输出截断），并支持环境变量覆盖默认值。

#### Scenario: 默认配置生效
- **WHEN** 未设置相关环境变量
- **THEN** 系统使用内置默认配置并可正常运行

#### Scenario: 环境变量覆盖配置
- **WHEN** 设置有效的配置环境变量
- **THEN** 对应运行参数在不改代码情况下生效

### Requirement: Agent loop SHALL inject relevant memory before model request
主循环在每轮模型请求前 SHALL 基于最新用户输入注入相关记忆上下文，并通过统一的 system prompt 组装流水线将该上下文作为补充 system message 注入，且保持原有工具调用契约不变。

#### Scenario: 命中记忆时通过 prompt pipeline 注入上下文
- **WHEN** 最新用户输入可命中记忆条目
- **THEN** 主循环在发起模型请求前通过 prompt pipeline 追加 `memory_context` system message

### Requirement: Agent loop SHALL assign trace context for each round
主循环在每轮模型请求前 SHALL 分配 `trace_id`，并将该上下文贯穿本轮工具调用与通知事件。

#### Scenario: 单轮内共享同一 trace
- **WHEN** 主循环进入一次新的模型请求轮次
- **THEN** 该轮产生的工具调用与观测事件共享同一个 `trace_id`

### Requirement: Agent loop SHALL record replay-safe request metadata
主循环 SHALL 记录回放所需的最小元数据，包括轮次编号、最新用户输入摘要和 token 估算，但不得要求完整重放模型原文响应。

#### Scenario: 请求元数据写入事件流
- **WHEN** 主循环发起模型请求
- **THEN** 观测事件中包含本轮编号、用户输入摘要和 token 估算字段

### Requirement: Agent loop SHALL build system input through prompt pipeline
主循环在每轮模型请求前 SHALL 通过统一 prompt pipeline 构建模型 system 输入，而不是直接在多个模块中分别拼接稳定规则、动态提醒和运行时通知。

#### Scenario: 发起请求前统一构建 system 输入
- **WHEN** 主循环准备发起新的模型请求
- **THEN** 主循环先调用 prompt pipeline 获取 system 输入，再与历史消息拼装最终请求

### Requirement: Agent loop SHALL recover from bounded model request failures
主循环在单轮模型请求期间 SHALL 维护最小恢复状态，并在限定预算内处理可恢复失败，而不是一遇到异常就直接中断。

#### Scenario: 单轮请求内执行恢复路径
- **WHEN** 主循环在一次用户轮次内遇到可恢复的模型请求失败
- **THEN** 主循环在同一轮内执行对应恢复动作，并仅在成功或明确失败后结束该轮

### Requirement: Agent loop SHALL return an explicit failure reason for unrecoverable model errors
当错误不可恢复，或某类恢复预算已耗尽时，主循环 SHALL 明确终止该轮并返回失败原因，而不是死循环或静默退出。

#### Scenario: 不可恢复错误明确终止
- **WHEN** 模型请求遭遇不可恢复错误或恢复预算耗尽
- **THEN** 主循环记录失败原因并结束当前轮次

### Requirement: Agent loop SHALL inject scheduled prompts before the next model request
主循环在每次模型请求前 SHALL 扫描并 drain 已命中的 `scheduled_prompt` 通知，并通过 prompt pipeline 将其作为动态 system 输入注入。

#### Scenario: 命中的调度提示在下一轮被注入
- **WHEN** 新一轮主循环开始，且存在待消费的 durable `scheduled_prompt` 通知
- **THEN** 主循环在发起模型请求前，将这些调度提示注入到下一次模型输入中

### Requirement: Agent loop SHALL auto-run delivery validation after successful write side effects
主循环在单轮工具执行中检测到成功的工作区写副作用后 SHALL 自动触发一次交付验证，并将结果摘要回灌到会话历史中。

#### Scenario: 写操作成功后触发自动验证
- **WHEN** 当前轮次成功执行 `write_file`、`edit_file` 或等效写操作
- **THEN** 主循环在本轮结束前自动运行统一交付验证，并将验证摘要追加到历史消息

### Requirement: Agent loop SHALL select models through the centralized model policy
主循环发起模型请求前 SHALL 通过统一模型策略模块选择模型并执行预算守卫，而不是直接使用单一静态模型。

#### Scenario: 主循环请求前执行模型策略
- **WHEN** 主循环准备发起新一轮模型请求
- **THEN** 系统先完成角色路由、预算检查和必要的 fallback 决策，再发起实际请求

### Requirement: Agent loop context tools SHALL support session-scoped runtime binding
主循环中依赖运行时消息上下文的工具 SHALL 支持按当前执行作用域读取 session 绑定的上下文，而不是从全局共享状态读取。

#### Scenario: 不同执行作用域读取各自上下文
- **WHEN** CLI 或 HTTP service 在不同 session 中进入 `agentLoop`
- **THEN** `estimate_tokens` 与 `compact` 仅读取当前 session 绑定的消息上下文

### Requirement: QueryToolStage boundary corrections MUST preserve tool result task and side effect semantics
QueryToolStage 边界校正 MUST 保持工具调用顺序、tool result 回填、写副作用标记和 task/todo 同步语义不变。

#### Scenario: 回填工具结果
- **WHEN** 模型返回 function tool calls
- **THEN** 系统继续按返回顺序执行，并为每个工具结果追加相同 shape 的 `role: tool` message

#### Scenario: 成功写工具产生副作用
- **WHEN** 写类工具成功执行
- **THEN** 系统继续标记 `wroteWorkspaceFiles` 并记录 touched paths，用于后续自动 delivery

#### Scenario: todo 完成触发 active task 自动完成
- **WHEN** 当前存在 active task 且 todo 工具将所有 items 标记为 completed
- **THEN** 系统继续自动调用 `task_update` 将 active task 标记为 completed，并清空 active task

### Requirement: QueryFinalization boundary corrections MUST preserve stop reason and round counter semantics
QueryFinalization 边界校正 MUST 保持 assistant-only / tool-driven stopReason 与 `roundsWithoutTodo` 更新语义不变。

#### Scenario: assistant-only 收尾
- **WHEN** 模型返回无工具调用的 assistant response
- **THEN** 系统继续返回 `assistant_response` 并递增 `roundsWithoutTodo`

#### Scenario: tool-driven 收尾使用 todo
- **WHEN** 工具轮次使用 todo
- **THEN** 系统继续将 `roundsWithoutTodo` 重置为 0

#### Scenario: tool-driven 收尾未使用 todo
- **WHEN** 工具轮次未使用 todo
- **THEN** 系统继续递增 `roundsWithoutTodo`

### Requirement: Runtime closeout boundary corrections MUST preserve query loop order trace and stop semantics
Runtime 剩余边界校正 MUST 保持 QueryEngine 主循环 stage 顺序、trace 分配、loop_start 观测、Stop hook 兜底和 query stop reason 语义不变。

#### Scenario: 主循环 round 初始化
- **WHEN** QueryEngine 开始新一轮执行
- **THEN** 系统继续递增 round counter、清理 touched paths、重置写副作用并分配新的 trace id

#### Scenario: loop_start 观测
- **WHEN** QueryEngine 记录 loop_start event
- **THEN** payload 继续包含 round 与 latestUserInput 摘要，且使用当前 round trace id

#### Scenario: stop stage 兜底
- **WHEN** QueryEngine 在 prepare、model、tool 或 finalization 阶段后退出本轮
- **THEN** 系统继续在 finally 中运行 Stop stage 并传入当前 stop reason 与 tool call count
