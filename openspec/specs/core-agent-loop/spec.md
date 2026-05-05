# core-agent-loop Specification

## Purpose
TBD - created by archiving change prd-00-core-loop. Update Purpose after archive.
## Requirements
### Requirement: Agent loop SHALL handle tool-calling rounds deterministically
主循环 MUST 在每轮请求前注入团队消息通知摘要（若存在），同时保持既有工具调用顺序与回填契约不变。

#### Scenario: 团队消息通知注入
- **WHEN** 团队收件箱出现新消息通知
- **THEN** 主循环在下一轮模型请求前附加通知 system 消息

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

