# core-agent-loop Specification

## Purpose
TBD - created by archiving change prd-00-core-loop. Update Purpose after archive.
## Requirements
### Requirement: Agent loop SHALL handle tool-calling rounds deterministically
在既有轮次契约下，主循环 MUST 新增“前置注入阶段”：处理后台/子代理通知与自动压缩后再请求模型。

#### Scenario: 通知注入后再发起模型请求
- **WHEN** 存在后台任务或子代理完成通知
- **THEN** 主循环在本轮请求前追加对应 system 通知消息

#### Scenario: 自动压缩后仍保持轮次契约
- **WHEN** 触发自动压缩
- **THEN** 压缩完成后再发起模型请求，且工具执行顺序与回填契约不变

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

