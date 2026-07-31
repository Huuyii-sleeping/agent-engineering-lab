## ADDED Requirements

### Requirement: 阶段 E 编译 SHALL 使用 Mastra 原生控制流
Mastra Workflow compiler SHALL 将阶段 E IR 编译为共享 Mastra Instance 中的原生 Workflow、step、branch、foreach、loop、nested workflow 和 suspend/resume 组合。Adapter SHALL 只负责翻译、身份映射和事件归一化，不得实现独立 scheduler、通用任务队列或 snapshot engine。

#### Scenario: Mastra 缺少必要原生语义
- **WHEN** 锁定版本的 Mastra 无法满足某阶段 E 节点的取消、恢复或资源限制
- **THEN** 对应 capability gate 明确失败
- **AND** Adapter 不以隐藏调度器伪装支持

### Requirement: Parallel SHALL 通过受限 foreach 执行静态分支
Parallel 编译 SHALL 将静态分支描述转换为数组，并 SHALL 使用 Mastra `.foreach()` 和 per-run concurrency resolver 分发到静态分支 Workflow。有效并发度 SHALL 为节点配置、Workflow resource budget 与平台上限三者的最小值，且不得超过 10。

#### Scenario: 十二个分支限制为十并发
- **WHEN** Parallel 有 12 个分支且有效并发度为 10
- **THEN** 任意时刻最多执行 10 个分支
- **AND** 剩余分支由 Mastra foreach 等待执行

#### Scenario: 取消 Parallel
- **WHEN** 父运行在多个分支活动时被取消
- **THEN** Runtime 向活动分支传播 AbortSignal
- **AND** 不再启动等待中的分支或执行后续 Merge

### Requirement: Merge SHALL 确定性聚合分支结果
Merge SHALL 按声明的 branch order 聚合成功、失败和跳过结果，并 SHALL 支持 `fail-fast` 与 `collect` 两种首轮失败策略。相同输入、版本和分支结果 SHALL 产生稳定输出顺序。

#### Scenario: collect 模式存在失败分支
- **WHEN** 某分支失败且 Parallel 配置为 `collect`
- **THEN** Merge 输出包含结构化成功结果和失败摘要
- **AND** 不因 Promise 完成顺序改变聚合顺序

#### Scenario: fail-fast 模式发生失败
- **WHEN** 任一分支在 `fail-fast` 模式失败
- **THEN** Runtime 取消尚未完成的可取消分支
- **AND** 父节点以原始结构化错误收敛 failed

### Requirement: Iteration SHALL 强制输入和并发硬限制
Iteration SHALL 使用 Mastra `.foreach()` 执行统一子图，并 SHALL 强制数组输入、最大 1000 个元素、有效并发度 1 到 10、单项超时、整体超时、输出体积和失败策略。每个实例 SHALL 具有稳定 instanceId、item index 和变量作用域。

#### Scenario: Iteration 输入超过上限
- **WHEN** Iteration 输入包含超过 1000 个元素
- **THEN** Runtime 在启动任何内部节点前返回 limit exceeded 错误

#### Scenario: Iteration 断线重连
- **WHEN** 客户端从事件 id N 重连正在运行的 Iteration
- **THEN** Event Journal 只回放 id 大于 N 的实例事件
- **AND** instanceId 与 item index 在重连前后保持不变

### Requirement: Loop SHALL 使用原生 loop 并执行硬终止门槛
Loop SHALL 使用 Mastra `.dowhile()` 或 `.dountil()` 执行统一子图，并 SHALL 在 IR 中固定最大 1000 次、最长 24 小时、节点级超时、终止表达式、输出体积和嵌套深度。达到任一硬限制而业务终止条件未满足时 SHALL 返回结构化 limit exceeded 错误。

#### Scenario: Loop 达到最大次数
- **WHEN** Loop 完成第 1000 次迭代且终止表达式仍为 false
- **THEN** Runtime 不启动第 1001 次迭代
- **AND** 运行以明确循环次数超限错误收敛

#### Scenario: 取消 Loop
- **WHEN** 用户取消正在执行内部节点的 Loop
- **THEN** AbortSignal 传播到当前内部节点
- **AND** 不执行下一次 condition 或 iteration

### Requirement: Subworkflow SHALL 保持父子执行身份和版本
Subworkflow SHALL 执行 IR 中固定的不可变子版本，并 SHALL 为父 run、父 node、child run 与内部 node instance 建立稳定映射。子流程事件、错误和取消 SHALL 关联到父节点，且不得因父 Workflow 重建而切换子版本。

#### Scenario: 查询嵌套执行
- **WHEN** 客户端查询包含 Subworkflow 的父运行
- **THEN** 快照可定位 childRunId、固定 versionId 和当前内部节点
- **AND** 产品事件不暴露 Mastra 内部 step graph

#### Scenario: 子流程失败
- **WHEN** 子流程内部节点失败且未被子流程处理
- **THEN** 错误链保留 childRunId、内部 nodeId 和父 nodeId
- **AND** 按父 Subworkflow 节点的失败策略继续或终止

### Requirement: Agent 节点 SHALL 通过 AgentRuntimePort 执行
Agent 节点 SHALL 通过 `AgentRuntimePort` 使用固定 Agent version 创建子 Agent run。Runtime SHALL 从父 Workflow 的认证上下文派生 owner/resource，并为父 run + node instance 创建隔离 thread；Tool、Skill、Memory、取消和审计 SHALL 继续遵守 AgentRuntimePort 契约。

#### Scenario: Agent 节点调用 Tool
- **WHEN** 子 Agent 根据其发布配置调用 Tool
- **THEN** 调用经过 ToolExecutionPort 的权限、安全与审计链路
- **AND** Workflow 客户端不能注入额外 Tool 绕过 Agent 配置

#### Scenario: 取消 Agent 节点
- **WHEN** 父 Workflow 在子 Agent run 活动时取消
- **THEN** Workflow Runtime 调用 AgentRuntimePort cancel 并等待稳定终态
- **AND** 不在 Workflow Adapter 内直接终止模型客户端

### Requirement: 阶段 E 事件 SHALL 保持产品游标与实例身份
Workflow 事件 SHALL 继续使用单 run 内严格递增的 Orbit event id，并 SHALL 使用向后兼容字段表达 containerId、instanceId、iterationIndex、childRunId 和 waiting metadata。Mastra 原生 chunk、step key 和 snapshot 内容不得直接暴露给 Web/BFF。

#### Scenario: 旧客户端消费阶段 E 事件
- **WHEN** 旧客户端忽略不认识的可选实例字段或新事件成员
- **THEN** 既有 run/node status、output 和终态仍可正常展示

### Requirement: 阶段 E Capability SHALL 按单项综合门槛开放
发布任一阶段 E capability 前 SHALL 验证与该 capability 相关的 10 个并发 Agent/Workflow 运行、持续 SSE、断线回放、取消竞态、资源硬限制、身份和 suspend/resume 门槛。某项门槛失败 SHALL 只保持该 capability 及其显式依赖能力禁用，不得阻塞已经通过全部相关门槛且无依赖关系的其他 capability。BFF 发布门与 Agent 启动门 SHALL 使用同一共享默认矩阵。

#### Scenario: Parallel 门槛失败但其他能力通过
- **WHEN** `parallelMerge` 因活动 sibling 无法在 fail-fast 时取消而失败
- **AND** Iteration、Loop、Nested Workflow、Agent、Human Approval 和 restart/resume 已通过各自门槛
- **THEN** capability report 与共享生产矩阵保持 `parallelMerge = false`
- **AND** 其他六项 capability MAY 独立开放

#### Scenario: 发布端与运行端能力一致
- **WHEN** BFF 校验包含阶段 E 节点的 Workflow 发布
- **AND** Agent Runtime 启动同一 WorkflowVersion
- **THEN** 两端对每项 capability 得出相同允许或拒绝结果
