## ADDED Requirements

### Requirement: Compile immutable workflow versions
系统 SHALL 将发布版本编译为不可变 Workflow IR，完成 schema、图、端口、变量、资源预算和 executor 绑定校验；运行 SHALL 只引用版本 id 与内容 hash。

#### Scenario: Compile before publish
- **WHEN** 用户发布一个合法草稿
- **THEN** 系统生成编译成功的不可变版本和内容 hash，后续草稿编辑不影响该版本的运行

### Requirement: Deterministic workflow state machine
Agent runtime SHALL 使用持久状态机调度 ready 节点，并 SHALL 支持顺序、条件分支、跳过、并行和汇聚的确定性状态转换。

#### Scenario: Execute an exclusive branch
- **WHEN** Condition 节点选择其中一个分支
- **THEN** runtime 只调度命中分支，将其他互斥分支标记为 skipped，并在 Merge 处按声明策略继续

### Requirement: Node executor registry
Agent runtime SHALL 通过 executor registry 执行节点，并 SHALL 首批支持 LLM、Tool、HTTP、Code、Template、Variable、Condition 和 Output 节点。

#### Scenario: Execute a tool node
- **WHEN** Tool 节点进入 ready 状态
- **THEN** runtime 通过现有工具执行与权限链路调用指定工具，并将结构化结果写入节点输出

### Requirement: Run control and streaming events
系统 SHALL 支持启动、取消、停止、查询工作流运行，并 SHALL 以 SSE 输出 run/node 状态、增量输出、日志和等待事件。

#### Scenario: Cancel an active run
- **WHEN** 用户取消正在执行的工作流
- **THEN** runtime 停止调度新节点，向可取消 executor 传播取消信号，并最终将运行标记为 cancelled

### Requirement: Timeouts retries and error routes
每个可执行节点 SHALL 支持超时、有限重试、退避、终止、默认值继续或 error handle 策略；非幂等节点 SHALL 不得静默自动重试。

#### Scenario: Retry an idempotent HTTP node
- **WHEN** HTTP 节点遇到配置为可重试的临时错误
- **THEN** runtime 按上限和退避策略重试，记录每次 attempt，并在耗尽后进入声明的失败策略

### Requirement: Bounded parallel iteration and loop
系统 SHALL 支持 Parallel/Merge、Iteration 和 Loop 容器，并 SHALL 强制并行度、最大次数、超时、数据量和嵌套深度限制。

#### Scenario: Loop exceeds its limit
- **WHEN** Loop 达到最大次数但终止条件仍未满足
- **THEN** runtime 以明确的 limit exceeded 错误终止或进入 error handle，不得无限运行

### Requirement: Pause checkpoint and resume
runtime SHALL 在人工输入、审批或可恢复长任务处持久化检查点，并 SHALL 在进程重启后从一致状态恢复。

#### Scenario: Resume after human approval
- **WHEN** 运行在 Human Approval 节点进入 waiting，用户随后批准
- **THEN** 系统验证审批权限和版本后从检查点继续，已成功的非重放节点不重复执行

### Requirement: Controlled workflow triggers
系统 SHALL 支持手动、API、Webhook、Schedule 和内部 Event 触发，并 SHALL 对外部触发执行认证、幂等、限流和版本固定。

#### Scenario: Receive a duplicate webhook
- **WHEN** 相同幂等键的 Webhook 在有效窗口内重复到达
- **THEN** 系统返回已有运行引用，不创建重复运行
