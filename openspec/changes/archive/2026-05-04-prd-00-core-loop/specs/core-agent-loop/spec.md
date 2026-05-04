## ADDED Requirements

### Requirement: Agent loop SHALL handle tool-calling rounds deterministically
运行时 SHALL 执行可重复的“模型调用 + 工具处理”轮次流程。
在每一轮中，系统 SHALL 先将 assistant 消息写入历史，再按顺序执行每个 tool call，并将每个工具结果以 `role: tool` 写回历史；若某一轮无 tool calls，循环 SHALL 结束。

#### Scenario: 无 tool calls 时本轮立即结束
- **WHEN** 模型响应不包含 `tool_calls`
- **THEN** 运行时结束当前 Agent 循环，且不尝试执行任何工具

#### Scenario: 存在 tool calls 时继续回填并进入下一轮
- **WHEN** 模型响应包含一个或多个 `tool_calls`
- **THEN** 运行时按顺序执行每个工具调用，并在进入下一轮前将结果写入历史

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
