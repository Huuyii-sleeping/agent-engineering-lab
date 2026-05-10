## ADDED Requirements

### Requirement: Agent loop SHALL recover from bounded model request failures
主循环在单轮模型请求期间 SHALL 维护最小恢复状态，并在限定预算内处理可恢复失败，而不是一遇到异常就直接中断。

#### Scenario: 单轮请求内执行恢复路径
- **WHEN** 主循环在一次用户轮次内遇到可恢复的模型请求失败
- **THEN** 主循环在同一轮内执行对应恢复动作，并仅在成功或明确失败后结束该轮

### Requirement: Agent loop SHALL return an explicit failure reason for unrecoverable model errors
当错误不可恢复，或某类恢复预算已耗尽时，主循环 SHALL 明确终止该轮并返回失败原因，而不是死循环或静默退出。

#### Scenario: 不可恢复错误明确终止
- **WHEN** 模型请求遭遇不可恢复错误或恢复预算耗尽
- **THEN** 主循环记录失败原因并结束当前轮次
