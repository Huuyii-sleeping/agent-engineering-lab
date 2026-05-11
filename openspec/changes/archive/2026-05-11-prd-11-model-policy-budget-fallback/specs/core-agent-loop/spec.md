## ADDED Requirements

### Requirement: Agent loop SHALL select models through the centralized model policy
主循环发起模型请求前 SHALL 通过统一模型策略模块选择模型并执行预算守卫，而不是直接使用单一静态模型。

#### Scenario: 主循环请求前执行模型策略
- **WHEN** 主循环准备发起新一轮模型请求
- **THEN** 系统先完成角色路由、预算检查和必要的 fallback 决策，再发起实际请求
