# subagent-tool-execution Specification

## Purpose
定义子代理在受限工具集下执行多轮 tool-calling 的行为边界，以及其对主代理的完成通知契约。
## Requirements
### Requirement: Subagent SHALL execute a tool-calling loop with base tools
子代理 SHALL 在一次委派执行中支持多轮工具调用，并可调用基础工具集（`bash/read_file/write_file/edit_file/todo/task_*`）。

#### Scenario: 子代理调用 write_file 落盘
- **WHEN** 主代理发送“在 tmp 创建 markdown 文件”的任务给子代理
- **THEN** 子代理通过 `write_file` 执行并在工作区产生实际文件

#### Scenario: 子代理多工具串行执行
- **WHEN** 子代理响应含多个 tool calls
- **THEN** 系统按顺序执行并回填 `role: tool` 消息后继续下一轮

### Requirement: Subagent MUST forbid recursive subagent tool usage
子代理 MUST 不得调用 `subagent_*` 工具，防止递归委派失控。

#### Scenario: 子代理工具白名单不包含 subagent
- **WHEN** 子代理执行模型请求
- **THEN** 注入工具集中不包含 `subagent_spawn/send/wait/list/close`

### Requirement: Agent SHALL provide completion notifications to main loop
子代理完成或失败后，系统 SHALL 记录通知事件，并在主代理后续轮次自动注入摘要。

#### Scenario: 完成事件注入
- **WHEN** 某子代理状态变为 `completed`
- **THEN** 主循环在下一次模型请求前附加该子代理结果摘要

#### Scenario: 失败事件注入
- **WHEN** 某子代理状态变为 `failed`
- **THEN** 主循环在下一次模型请求前附加失败原因摘要

### Requirement: Subagent tool execution MUST enforce the same security policy as main agent
子代理执行工具时 MUST 与主代理共享同一套策略引擎与审批状态，不允许绕过安全边界。

#### Scenario: 子代理高风险工具调用被拦截
- **WHEN** 子代理调用高风险 `bash` 且无审批
- **THEN** 返回与主代理一致的拦截错误码
