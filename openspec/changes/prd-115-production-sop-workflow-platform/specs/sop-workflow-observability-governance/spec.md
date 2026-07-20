## ADDED Requirements

### Requirement: Run history and node traces
系统 SHALL 保存可查询的运行历史和节点级 trace，包括状态、attempt、输入输出摘要、耗时、模型 token/成本、错误和关联 id。

#### Scenario: Inspect a failed run
- **WHEN** 用户打开失败的工作流运行
- **THEN** 页面定位失败节点并展示脱敏输入、错误链、前置节点状态、attempt 和可执行的恢复操作

### Requirement: Variable inspector and replay
系统 SHALL 提供按节点查看变量快照的检查器，并 SHALL 支持从失败节点重试或基于历史输入创建新运行。

#### Scenario: Retry from a failed node
- **WHEN** 用户修复外部依赖后从失败节点重试
- **THEN** runtime 从一致检查点恢复，复用允许复用的成功输出，并为新 attempt 保留完整审计链

### Requirement: Secret and environment management
系统 SHALL 将 secret value 与工作流定义分离，只保存 credential reference；日志、事件、导出和 API SHALL 默认脱敏。

#### Scenario: Export a workflow using credentials
- **WHEN** 用户导出包含 HTTP 凭据的工作流
- **THEN** 导出文件只包含凭据引用和所需 capability，不包含 token、密码或 secret value

### Requirement: Runtime security policies
Code、HTTP、Tool 和 Agent 节点 SHALL 执行沙箱、权限、出站网络、SSRF、文件路径、响应体积和执行时间策略。

#### Scenario: HTTP node targets local metadata address
- **WHEN** HTTP 节点请求被策略禁止的本地或云元数据地址
- **THEN** runtime 在发出请求前拒绝执行，记录安全错误和审计事件

### Requirement: Audit and authorization
系统 SHALL 对工作流查看、编辑、发布、回滚、运行控制、审批和凭据使用执行授权并记录审计事件。

#### Scenario: Unauthorized user attempts to publish
- **WHEN** 没有发布权限的用户调用发布 API
- **THEN** BFF 拒绝操作，不创建版本，并记录被拒绝的审计事件

### Requirement: Quotas and resource limits
系统 SHALL 对节点数、边数、并行度、循环次数、嵌套深度、运行时长、事件体积和并发运行数实施可配置硬限制。

#### Scenario: Workflow exceeds publish limits
- **WHEN** 草稿超过当前工作区允许的节点或嵌套上限
- **THEN** 编译器阻止发布并报告当前值、限制值和对应位置

### Requirement: Retention redaction and deletion
系统 SHALL 为运行输入输出、事件、检查点和审计数据提供保留策略、敏感字段脱敏和可验证清理。

#### Scenario: Retention cleanup runs
- **WHEN** 运行数据超过配置保留期
- **THEN** 系统删除或聚合受策略约束的数据，保留必要审计摘要，并报告清理数量与失败项

### Requirement: Production performance gates
系统 SHALL 建立可重复性能基线，首个门槛覆盖 200 节点/400 边编辑、10 并行节点运行和持续 SSE 事件消费。

#### Scenario: Run the editor performance benchmark
- **WHEN** CI 或发布检查执行大图基准
- **THEN** 系统验证画布交互、状态更新和内存指标未超过约定阈值，回归时阻止发布
