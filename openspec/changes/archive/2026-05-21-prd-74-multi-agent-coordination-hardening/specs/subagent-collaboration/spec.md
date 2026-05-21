## ADDED Requirements

### Requirement: Subagent lifecycle SHALL expose role and parent relationship metadata

系统 SHALL 在 subagent 生命周期中暴露子代理角色与父子关系元数据，以便 coordinator/worker/reviewer 等协作层次可以被明确识别。

#### Scenario: Spawned subagent declares role

- **WHEN** 模型调用 `subagent_spawn`
- **THEN** 子代理记录 SHALL 包含 role 元数据
- **AND** `subagent_list` SHALL 返回该 role

#### Scenario: Spawned subagent declares parent agent

- **WHEN** 模型调用 `subagent_spawn` 时传入 parent agent 信息
- **THEN** 子代理记录 SHALL 记录父子关系元数据
- **AND** snapshot/notification 输出 SHALL 保留该关系可见性

