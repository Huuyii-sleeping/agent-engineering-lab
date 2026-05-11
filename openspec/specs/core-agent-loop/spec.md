# core-agent-loop Specification

## Purpose
TBD - created by archiving change prd-00-core-loop. Update Purpose after archive.

## Requirements
### Requirement: Agent loop SHALL handle tool-calling rounds deterministically
主循环 MUST 在每轮前支持自治轮询入口，并在不破坏既有工具调用契约的前提下处理自治状态更新。

#### Scenario: 自治入口与主循环兼容
- **WHEN** 主循环进入新一轮
- **THEN** 自治检查先执行，随后保持原有 tool-calling 顺序和回填流程

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
