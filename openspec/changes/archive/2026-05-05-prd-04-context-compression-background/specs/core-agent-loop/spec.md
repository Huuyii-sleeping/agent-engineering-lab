## MODIFIED Requirements

### Requirement: Agent loop SHALL handle tool-calling rounds deterministically
在既有轮次契约下，主循环 MUST 新增“前置注入阶段”：处理后台/子代理通知与自动压缩后再请求模型。

#### Scenario: 通知注入后再发起模型请求
- **WHEN** 存在后台任务或子代理完成通知
- **THEN** 主循环在本轮请求前追加对应 system 通知消息

#### Scenario: 自动压缩后仍保持轮次契约
- **WHEN** 触发自动压缩
- **THEN** 压缩完成后再发起模型请求，且工具执行顺序与回填契约不变
