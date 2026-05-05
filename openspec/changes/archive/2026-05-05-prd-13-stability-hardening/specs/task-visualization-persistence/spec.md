## ADDED Requirements

### Requirement: Task persistence SHALL include schema version and guarded transitions
任务持久化记录 MUST 包含 `schemaVersion` 字段；系统 MUST 对任务状态转移执行守卫并拒绝非法跳转。

#### Scenario: 读取旧版本任务文件
- **WHEN** 任务文件缺少 `schemaVersion`
- **THEN** 系统仍可读取并提供兼容默认值

#### Scenario: 拒绝非法状态跳转
- **WHEN** 已完成任务尝试变更为非 `completed`
- **THEN** 系统返回结构化错误，错误码为 `INVALID_STATUS_TRANSITION`
