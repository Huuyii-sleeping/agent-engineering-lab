## ADDED Requirements

### Requirement: Agent loop SHALL inject scheduled prompts before the next model request
主循环在每轮模型请求前 SHALL 扫描并消费命中的 `scheduled_prompt` 通知，并将其作为统一动态输入注入 prompt pipeline。

#### Scenario: 调度命中后进入下一轮主循环
- **WHEN** 主循环开始新一轮且存在已命中的 `scheduled_prompt`
- **THEN** 主循环在发起模型请求前将这些调度内容注入模型输入
