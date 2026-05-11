## ADDED Requirements

### Requirement: Delivery validation SHALL execute a centralized staged pipeline
系统 SHALL 通过统一验证执行器按阶段执行交付验证，而不是要求调用方手工串联 lint、test、build 和附加检查。

#### Scenario: 启动标准验证流水线
- **WHEN** Agent 显式请求交付验证，或主循环在本轮写副作用后触发自动验证
- **THEN** 系统按统一计划执行标准阶段，并产出同一份验证结果

### Requirement: Delivery validation SHALL emit structured failure records
系统在验证失败时 SHALL 输出结构化失败结果，至少包含 `stage`、`code`、`message` 与 `suggestion`。

#### Scenario: 测试阶段失败
- **WHEN** `test` 阶段命令返回失败
- **THEN** 结果中包含 `TEST_FAILED` 或等效结构化错误码，并给出下一步修复建议

### Requirement: Delivery validation MUST persist a delivery report
系统 MUST 将最近一次验证结果写入持久化报告，供评审、归档与后续自动化消费。

#### Scenario: 验证完成后落盘报告
- **WHEN** 一次交付验证执行结束
- **THEN** 系统将完整结果写入 `.delivery/delivery_report.json`

### Requirement: Delivery validation SHALL support bounded retry for recoverable execution failures
系统 SHALL 对可恢复的执行级失败提供有限自动重试，但在预算耗尽后 MUST 明确终止并保留失败原因。

#### Scenario: 瞬时执行失败后重试
- **WHEN** 验证命令遭遇 timeout、spawn 异常或等效瞬时故障
- **THEN** 系统在预算内重试该阶段，并在报告中记录重试次数

### Requirement: Agent loop SHALL auto-run delivery validation after write side effects
主循环在单轮中检测到工作区写副作用后 SHALL 自动触发一次交付验证，而不是完全依赖模型再次主动调用。

#### Scenario: 本轮修改代码后自动验证
- **WHEN** Agent 在当前轮次执行 `write_file`、`edit_file` 或等效写操作
- **THEN** 主循环在结束前自动执行一次交付验证，并将结果摘要保留在历史中
