## ADDED Requirements

### Requirement: Runtime closeout boundary corrections MUST preserve query loop order trace and stop semantics
Runtime 剩余边界校正 MUST 保持 QueryEngine 主循环 stage 顺序、trace 分配、loop_start 观测、Stop hook 兜底和 query stop reason 语义不变。

#### Scenario: 主循环 round 初始化
- **WHEN** QueryEngine 开始新一轮执行
- **THEN** 系统继续递增 round counter、清理 touched paths、重置写副作用并分配新的 trace id

#### Scenario: loop_start 观测
- **WHEN** QueryEngine 记录 loop_start event
- **THEN** payload 继续包含 round 与 latestUserInput 摘要，且使用当前 round trace id

#### Scenario: stop stage 兜底
- **WHEN** QueryEngine 在 prepare、model、tool 或 finalization 阶段后退出本轮
- **THEN** 系统继续在 finally 中运行 Stop stage 并传入当前 stop reason 与 tool call count
