## ADDED Requirements

### Requirement: CLI product surface MUST use a shared terminal UI renderer
CLI 产品表面 MUST 使用共享 terminal UI renderer 呈现 banner、状态、帮助、错误、工具事件和收尾摘要，避免多个入口各自拼接不一致的终端文本。

#### Scenario: Interactive CLI starts with product banner
- **WHEN** 用户启动默认交互 CLI
- **THEN** 系统显示产品名、当前 workspace、model、session、可用入口和关键 slash commands
- **AND** 输出在无颜色终端中仍保持可读

#### Scenario: TUI and CLI share visual language
- **WHEN** 用户分别使用默认 CLI 和 TUI
- **THEN** 两者的 section 标题、状态语义、错误格式和命令帮助保持一致

### Requirement: CLI MUST provide deterministic slash command navigation
CLI MUST 提供确定性的 slash command 导航层，使用户可以不用记忆隐藏能力即可查看状态、配置、工具、会话和诊断结果。

#### Scenario: User asks for command help
- **WHEN** 用户输入 `/help`
- **THEN** 系统列出可用命令、用途和示例
- **AND** 不调用模型

#### Scenario: User checks runtime status
- **WHEN** 用户输入 `/status`
- **THEN** 系统显示当前 session、model、workspace、tool count、MCP count、scheduler/bridge 状态
- **AND** 不改变会话历史

#### Scenario: Unknown slash command is handled predictably
- **WHEN** 用户输入未知 slash command
- **THEN** 系统返回稳定错误和最接近的帮助提示
- **AND** 不把该命令发送给模型

### Requirement: CLI MUST expose operational control surfaces directly in the terminal
CLI MUST 直接暴露 model、permissions、usage、compact、workspace roots 和 shell shortcut 等高频控制面，而不是要求用户依赖模型间接触发底层能力。

#### Scenario: User changes model or permission mode locally
- **WHEN** 用户输入 `/model <id>` 或 `/permissions <mode>`
- **THEN** CLI/TUI 更新当前运行状态
- **AND** 后续状态视图与工具执行遵循新的本地设置

#### Scenario: User inspects token and cost summary
- **WHEN** 用户输入 `/cost` 或 `/usage`
- **THEN** 系统展示 session/daily token 使用量、预算和估算成本
- **AND** 不调用模型

#### Scenario: User adds another workspace root
- **WHEN** 用户输入 `/add-dir <path>`
- **THEN** 系统把该目录加入可访问 workspace roots
- **AND** 文件工具允许访问新增 root 内的路径

#### Scenario: User clears context versus redraws UI
- **WHEN** 用户输入 `/clear`
- **THEN** 系统开始新的 session
- **AND** 不把 `/clear` 解释成单纯清屏

#### Scenario: User runs a shell shortcut
- **WHEN** 用户输入 `!<command>`
- **THEN** 系统通过现有 bash/security runtime 执行命令
- **AND** 结果以统一产品事件格式呈现

### Requirement: CLI MUST include a local doctor for configuration readiness
CLI MUST 提供本地 doctor 检查模型配置、workspace、MCP、hooks、权限和常见运行风险，并输出可执行修复建议。

#### Scenario: Doctor detects missing model configuration
- **WHEN** `MODEL_ID` 或必要模型配置缺失
- **THEN** doctor 输出 `error` 级别检查结果
- **AND** 给出设置环境变量或配置文件的修复建议

#### Scenario: Doctor summarizes healthy workspace
- **WHEN** 本地 workspace、配置和关键目录可用
- **THEN** doctor 输出通过项和简短摘要

### Requirement: CLI MUST present tool execution and task progress as product events
CLI MUST 将工具执行、后台任务、调度通知和交付验证呈现为统一产品事件，包含状态、耗时、风险和简短结果，而不是只输出原始 JSON 或散乱文本。

#### Scenario: Tool starts and completes
- **WHEN** runtime 执行工具调用
- **THEN** CLI 显示 tool name、preview、状态变化和耗时

#### Scenario: Tool fails or requires approval
- **WHEN** 工具失败或触发安全审批
- **THEN** CLI 显示清晰原因、风险说明和下一步动作

#### Scenario: TUI captures tool events without breaking layout
- **WHEN** TUI 中的会话触发工具执行或 runtime 事件
- **THEN** 事件进入 activity 区域
- **AND** 不直接把原始日志打到全屏布局中

### Requirement: CLI MUST produce a closeout summary for completed work
CLI MUST 在任务型会话结束时提供收尾摘要，覆盖改动、验证、风险和后续建议。

#### Scenario: Work session completes with file changes
- **WHEN** 本轮会话产生 workspace 改动
- **THEN** CLI 收尾输出 modified files、validation commands、open risks 和 suggested next steps

#### Scenario: Work session completes without file changes
- **WHEN** 本轮只回答问题或查询状态
- **THEN** CLI 收尾摘要保持简短，不制造无意义的交付清单
