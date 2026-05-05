# subagent-collaboration Specification

## Purpose
TBD - created by archiving change prd-03-subagent-collaboration. Update Purpose after archive.
## Requirements
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
原“仅文本推理”更新为“受限工具推理”：子代理 MUST 仅可使用基础工具白名单，不得获得完整主代理权限。

#### Scenario: 可执行基础工具
- **WHEN** 子代理接收到需要文件落盘或命令执行的任务
- **THEN** 子代理可通过基础工具完成任务并返回真实执行结果

#### Scenario: 禁止递归子代理工具
- **WHEN** 子代理尝试调用 `subagent_*` 能力
- **THEN** 系统拒绝该能力，不向其注入相关工具定义

### Requirement: Existing loop behaviors MUST remain compatible
新增子代理工具后，PRD-00/01/02 已有工具行为 MUST 保持兼容。

#### Scenario: 既有工具链路不回归
- **WHEN** 模型继续调用 `bash/read_file/write_file/edit_file/todo/task_*`
- **THEN** 系统行为与新增前一致，工具仍按顺序执行并回填结果

