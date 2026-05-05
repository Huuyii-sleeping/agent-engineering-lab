## ADDED Requirements

### Requirement: Tool execution MUST pass through policy evaluation
所有工具调用 MUST 在执行前经过统一策略评估，并基于评估结果执行放行、拦截或审批流程。

#### Scenario: 高风险命令无审批被拦截
- **WHEN** 调用高风险 `bash` 命令且无有效审批
- **THEN** 返回结构化错误并阻止执行

#### Scenario: 普通读操作放行
- **WHEN** 调用低风险 `read_file`
- **THEN** 策略允许并正常执行

