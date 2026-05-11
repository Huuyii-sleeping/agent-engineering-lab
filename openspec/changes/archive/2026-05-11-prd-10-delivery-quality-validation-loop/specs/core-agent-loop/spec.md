## ADDED Requirements

### Requirement: Agent loop SHALL auto-run delivery validation after successful write side effects
主循环在单轮工具执行中检测到成功的工作区写副作用后 SHALL 自动触发一次交付验证，并将结果摘要回灌到会话历史中。

#### Scenario: 写操作成功后触发自动验证
- **WHEN** 当前轮次成功执行 `write_file`、`edit_file` 或等效写操作
- **THEN** 主循环在本轮结束前自动运行统一交付验证，并将验证摘要追加到历史消息
