## ADDED Requirements

### Requirement: Runtime closeout internals MUST separate engine round notification prompt and service session helper boundaries
Runtime 剩余收口 MUST 区分 QueryEngine round state、notification formatter / recorder、user prompt submit 和 service session helper 边界，使主循环编排、通知注入、用户提交入口和 HTTP session 适配可以独立演进。

#### Scenario: 调整 QueryEngine round metadata
- **WHEN** 系统调整 round 初始化、latest user 摘要或 loop_start metadata
- **THEN** 维护者主要修改 QueryEngine round 边界，而不是修改模型、工具或 finalization 阶段

#### Scenario: 调整通知格式化或观测
- **WHEN** 系统调整 scheduled/subagent/background/team notification 的文案或事件记录
- **THEN** 维护者主要修改 notification formatter / recorder 边界，而不是修改 query preparation orchestration

#### Scenario: 调整 HTTP session state helper
- **WHEN** 系统调整 session summary、record 创建或排序规则
- **THEN** 维护者主要修改 service session helper 边界，而不是修改 query runtime 或 HTTP 路由主体
