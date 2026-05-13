## ADDED Requirements

### Requirement: QueryFinalization boundary corrections MUST preserve auto delivery finalization semantics
QueryFinalization 边界校正 MUST 保持 auto delivery 触发条件、changedPaths、traceId 和摘要回填语义不变。

#### Scenario: 写副作用触发自动交付验证
- **WHEN** `deliveryAutoRunEnabled` 为 true 且 runtime state 记录了写副作用
- **THEN** 系统继续以 `mode: "auto"`、当前 touched paths 和 traceId 调用 delivery validation

#### Scenario: 自动交付验证摘要回填
- **WHEN** auto delivery 完成
- **THEN** 系统继续向会话历史追加 pass/fail assistant summary，并返回对应 `auto_delivery_passed` 或 `auto_delivery_failed`
