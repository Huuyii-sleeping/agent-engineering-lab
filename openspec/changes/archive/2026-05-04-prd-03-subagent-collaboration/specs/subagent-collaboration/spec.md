## ADDED Requirements

### Requirement: Agent SHALL provide subagent lifecycle management tools
系统 SHALL 提供 `subagent_spawn`、`subagent_send`、`subagent_wait`、`subagent_list`、`subagent_close`，用于子代理创建、委派、等待、查询与关闭。

#### Scenario: 创建并查询子代理
- **WHEN** 模型调用 `subagent_spawn` 创建子代理后调用 `subagent_list`
- **THEN** 返回结果包含新子代理 `id`、`name` 与 `idle` 状态

#### Scenario: 关闭子代理
- **WHEN** 模型调用 `subagent_close` 且 `agent_id` 存在
- **THEN** 该子代理状态变为 `closed` 且后续不可继续派发

### Requirement: Subagent execution MUST be asynchronous and stateful
`subagent_send` MUST 异步启动一次子代理执行并立即返回；`subagent_wait` MUST 支持按超时等待并返回状态。

#### Scenario: 发送任务后进入运行态
- **WHEN** 模型调用 `subagent_send` 且子代理当前为 `idle/completed/failed`
- **THEN** 系统立即返回 accepted，子代理状态切换为 `running`

#### Scenario: 等待超时
- **WHEN** 模型调用 `subagent_wait` 且在超时时间内子代理仍未结束
- **THEN** 系统返回 `WAIT_TIMEOUT` 错误并保持当前状态

#### Scenario: 运行中重复发送
- **WHEN** 模型对同一 `running` 子代理再次调用 `subagent_send`
- **THEN** 系统返回 `AGENT_BUSY` 错误

### Requirement: Subagent MUST run without tool privileges
子代理执行时 MUST 仅进行文本模型调用，不得使用主代理工具集，防止权限扩散。

#### Scenario: 子代理执行不注入工具
- **WHEN** 系统发起子代理模型调用
- **THEN** 请求参数中不包含 `tools` 字段，输出仅为文本内容

### Requirement: Existing loop behaviors MUST remain compatible
新增子代理工具后，PRD-00/01/02 已有工具行为 MUST 保持兼容。

#### Scenario: 既有工具链路不回归
- **WHEN** 模型继续调用 `bash/read_file/write_file/edit_file/todo/task_*`
- **THEN** 系统行为与新增前一致，工具仍按顺序执行并回填结果
