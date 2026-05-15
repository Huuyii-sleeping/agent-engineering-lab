## MODIFIED Requirements

### Requirement: Bash tool MUST enforce execution safety constraints
`bash(command)` 工具 MUST 在执行前进行命令内容校验，MUST 拒绝被屏蔽的危险片段，MUST 对高危解释器 / shell / remote-exec 模式进入显式审批边界，MUST 在启动子进程前清理高风险继承环境，MUST 在执行后 scrub 本次新植入的可疑 bare Git repo，MUST 执行 120 秒默认超时，且 MUST 将输出截断至最多 50,000 字符。

#### Scenario: 危险命令被拒绝
- **WHEN** `bash(command)` 接收到包含被屏蔽片段（`rm -rf /`、`sudo`、`shutdown`、`reboot`）的文本
- **THEN** 工具返回明确的拒绝错误，且不执行 shell 命令

#### Scenario: 高危解释器模式进入审批边界
- **WHEN** `bash(command)` 以 `python`、`node`、`bash`、`sh`、`ssh`、`eval` 或同类高危模式开头
- **THEN** 系统要求显式审批，而不是默认直接执行

#### Scenario: 长时间运行命令触发超时
- **WHEN** 命令执行超过 120 秒
- **THEN** 工具返回超时错误并终止对应进程

#### Scenario: 本次命令新植入 bare Git repo
- **WHEN** `bash(command)` 在工作区中新建含 `HEAD`、`objects/`、`refs/` 的可疑 bare Git repo 目录
- **THEN** 系统在命令执行后 scrub 该目录的核心仓库文件
- **AND** 在工具输出中附带对应的安全提示
