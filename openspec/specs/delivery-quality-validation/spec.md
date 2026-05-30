## Purpose
定义 Agent 的统一交付验证流水线、结构化失败结果、有限自动重试与交付报告落盘能力，支持本地实现后的质量闭环。
## Requirements
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

### Requirement: Delivery boundary corrections MUST preserve stage failure retry and report semantics
Delivery 边界校正 MUST 保持 stage plan、失败分类、retry 和 report JSON shape 的现有语义不变。

#### Scenario: 构建交付验证计划
- **WHEN** 系统根据 root 和 `apps/agent-cli` package scripts 构建验证计划
- **THEN** 阶段顺序、命令和 skip 条件与边界拆分前保持一致

#### Scenario: 执行阶段失败
- **WHEN** 某个验证阶段失败、超时或遇到瞬时执行失败
- **THEN** 系统继续返回相同的 failure code、suggestion、attempts 与 retry 行为

#### Scenario: 写入交付报告
- **WHEN** 验证完成后生成 `.delivery/delivery_report.json`
- **THEN** report schemaVersion、summary、stages、latestFailure、risks 和 suggestions shape 与边界拆分前保持一致

### Requirement: QueryFinalization boundary corrections MUST preserve auto delivery finalization semantics
QueryFinalization 边界校正 MUST 保持 auto delivery 触发条件、changedPaths、traceId 和摘要回填语义不变。

#### Scenario: 写副作用触发自动交付验证
- **WHEN** `deliveryAutoRunEnabled` 为 true 且 runtime state 记录了写副作用
- **THEN** 系统继续以 `mode: "auto"`、当前 touched paths 和 traceId 调用 delivery validation

#### Scenario: 自动交付验证摘要回填
- **WHEN** auto delivery 完成
- **THEN** 系统继续向会话历史追加 pass/fail assistant summary，并返回对应 `auto_delivery_passed` 或 `auto_delivery_failed`

### Requirement: Delivery validation tests MUST budget real subprocess coverage explicitly
交付验证测试在覆盖真实 `pnpm` 子进程阶段执行时，MUST 为对应用例设置局部、明确的测试超时预算，避免全量并发测试把正常子进程调度开销误判为业务失败。

#### Scenario: 全量测试中执行真实交付验证用例
- **WHEN** `agent-cli` 全量测试并发执行，且 delivery validation 单测启动真实 `pnpm` 阶段命令
- **THEN** 对应用例在明确测试预算内完成，不因 Vitest 默认 5s 用例超时而失败

#### Scenario: 保持交付验证运行时语义
- **WHEN** 调整 delivery validation 单测的测试预算
- **THEN** `runDeliveryValidation` 的阶段顺序、失败分类、retry 语义和 report JSON shape 保持不变

