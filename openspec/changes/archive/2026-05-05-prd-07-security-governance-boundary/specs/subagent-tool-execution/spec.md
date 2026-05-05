## ADDED Requirements

### Requirement: Subagent tool execution MUST enforce the same security policy as main agent
子代理执行工具时 MUST 与主代理共享同一套策略引擎与审批状态，不允许绕过安全边界。

#### Scenario: 子代理高风险工具调用被拦截
- **WHEN** 子代理调用高风险 `bash` 且无审批
- **THEN** 返回与主代理一致的拦截错误码

