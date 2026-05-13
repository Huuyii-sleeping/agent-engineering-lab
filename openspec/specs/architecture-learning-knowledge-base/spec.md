# architecture-learning-knowledge-base Specification

## Purpose
定义架构学习沉淀的仓库级知识资产边界，要求外部源码分析、本地实现映射、采纳结论和后续问题随生产级重构阶段同步更新。
## Requirements
### Requirement: Repository SHALL persist architecture learning notes as first-class project assets
仓库 MUST 将外部源码分析、本地源码映射和采纳结论沉淀为正式学习文档，而不是只保留在对话或临时说明中。

#### Scenario: 新增架构参考材料
- **WHEN** 团队引入新的外部架构参考源码、分析文章或本地基线材料
- **THEN** 仓库中会新增或更新对应学习文档，记录来源、提炼结论、映射关系与采纳状态

#### Scenario: 维护者回看历史决策
- **WHEN** 维护者阅读学习沉淀文档
- **THEN** 能直接看到“看到了什么、当前仓库差距是什么、采纳了什么、未采纳什么及原因”

### Requirement: Production architecture phases MUST update learning docs together with implementation planning
每一轮生产级架构重构阶段 MUST 与学习沉淀文档联动更新，保证规划、实现和学习资产保持同步。

#### Scenario: 创建新的架构重构 change
- **WHEN** 仓库创建新的生产级架构重构 change
- **THEN** 该 change 的 proposal / design / tasks 会引用或要求更新对应学习文档

#### Scenario: 完成一轮架构实现
- **WHEN** 一轮架构实现完成
- **THEN** 学习文档同步补充本轮采纳结果与仍待解决的结构问题，而不是停留在初始阅读笔记

### Requirement: Boundary correction phases MUST persist gap analysis and adoption status
每一轮生产级架构边界校正 MUST 在学习沉淀文档中记录外部源码启发、当前仓库差距、本轮采纳内容、暂不采纳内容和下一步动作。

#### Scenario: 完成 runtime service 边界校正
- **WHEN** 仓库完成一轮 runtime service 目录或依赖边界调整
- **THEN** `docs/learning/claude-code/` 中会新增或更新对应中文学习沉淀文档，说明本轮为什么这样收口

#### Scenario: 暂不迁移某个边界
- **WHEN** 设计中决定暂不迁移某个 service、目录或兼容入口
- **THEN** 学习沉淀文档必须记录暂不采纳原因，避免后续误判为遗漏

### Requirement: Runtime dependency shape changes MUST be documented
运行时依赖形态的调整 MUST 在学习沉淀文档中记录其边界收益、未采纳选项和后续动作。

#### Scenario: 引入 RuntimeServices 依赖包
- **WHEN** 仓库将 query runtime 的横切 service 依赖收成依赖包
- **THEN** 学习沉淀文档必须说明该依赖包解决了什么问题，以及为什么没有顺手重写工具协议层

### Requirement: Tool boundary corrections MUST record adopted and deferred boundaries
工具层边界校正 MUST 在学习沉淀文档中记录本轮采纳的 catalog/executor 划分，以及暂不迁移或暂不重写的工具层边界。

#### Scenario: 完成 ToolService 二次收口
- **WHEN** 仓库完成 ToolService 内部边界拆分
- **THEN** 学习沉淀文档说明 catalog、executor、ToolService facade 的职责，并记录为什么不迁移 `ToolService` 文件位置

### Requirement: Tool executor boundary corrections MUST record dispatch and target execution decisions
工具 executor 边界校正 MUST 在学习沉淀文档中记录本轮采纳的 dispatch、builtin executor 与 MCP executor 划分，以及暂不拆分的工具运行时边界。

#### Scenario: 完成 ToolExecutor 分发边界收口
- **WHEN** 仓库完成 ToolExecutor 内部边界拆分
- **THEN** 学习沉淀文档说明 dispatch、builtin executor、MCP executor 的职责，并记录为什么暂不拆 `runtime/tool-runtime.ts` 与 MCP client/registry

### Requirement: MCP boundary corrections MUST record adopted and deferred module splits
MCP 边界校正 MUST 在学习沉淀文档中记录本轮采纳的 config 与 protocol/output 划分，以及暂不拆分 client/registry 的原因。

#### Scenario: 完成 MCP 模块边界拆分
- **WHEN** 仓库完成 MCP config 与 protocol/output 模块拆分
- **THEN** 学习沉淀文档说明 config、protocol/output、client/registry 的职责，并记录为什么本轮不拆 `McpServerClient` 与 `McpRegistry`

### Requirement: MCP client registry boundary corrections MUST record combined split decisions
MCP client/registry 边界校正 MUST 在学习沉淀文档中记录本轮合并拆分 client 与 registry 的原因，以及 public API facade 保留的边界。

#### Scenario: 完成 MCP client 与 registry 边界拆分
- **WHEN** 仓库完成 MCP client 与 registry 模块拆分
- **THEN** 学习沉淀文档说明 client、registry、public API facade 的职责，并记录为什么这轮将 client 和 registry 合并执行

### Requirement: Security boundary corrections MUST record policy approval and facade decisions
Security 边界校正 MUST 在学习沉淀文档中记录本轮采纳的 policy、approval store、manager 与 tool facade 划分，以及不改变审批语义的原因。

#### Scenario: 完成 Security 工具模块边界收口
- **WHEN** 仓库完成 Security 工具模块边界拆分
- **THEN** 学习沉淀文档说明 policy、approval store、manager、tool facade 的职责，并记录本轮保持默认策略和审批状态机不变

### Requirement: Team boundary corrections MUST record adopted and deferred module splits
Team 边界校正 MUST 在学习沉淀文档中记录本轮采纳的 store、protocol、manager 与 tool facade 划分，以及暂不迁移的团队通信边界。

#### Scenario: 完成 Team 工具模块边界收口
- **WHEN** 仓库完成 Team 工具模块边界拆分
- **THEN** 学习沉淀文档说明 store、protocol、manager、tool facade 的职责，并记录本轮保持消息和协议语义不变

### Requirement: Worktree boundary corrections MUST record adopted and deferred module splits
Worktree 边界校正 MUST 在学习沉淀文档中记录本轮采纳的 store、runner、manager 与 tool facade 划分，以及暂不改变 closeout 和 task sync 语义的原因。

#### Scenario: 完成 Worktree 工具模块边界收口
- **WHEN** 仓库完成 Worktree 工具模块边界拆分
- **THEN** 学习沉淀文档说明 store、runner、manager、tool facade 的职责，并记录本轮保持 dirty guard、closeout 和 task sync 语义不变

### Requirement: Task board boundary corrections MUST record adopted and deferred module splits
TaskBoard 边界校正 MUST 在学习沉淀文档中记录本轮采纳的 types、store、manager 与 tool facade 划分，以及暂不继续拆 claim lock、autonomy 调用方或 worktree 调用方的原因。

#### Scenario: 完成 TaskBoard 任务模块边界收口
- **WHEN** 仓库完成 TaskBoard 内部边界拆分
- **THEN** 学习沉淀文档说明 types、store、manager、tool facade 的职责，并记录本轮保持任务状态机、claim 与 worktree sync 语义不变

### Requirement: Scheduler boundary corrections MUST record adopted and deferred module splits
Scheduler 边界校正 MUST 在学习沉淀文档中记录本轮采纳的 types、cron、store、manager 与 tool facade 划分，以及暂不继续拆 runtime coordination 或 background task 的原因。

#### Scenario: 完成 Scheduler 调度模块边界收口
- **WHEN** 仓库完成 Scheduler 内部边界拆分
- **THEN** 学习沉淀文档说明 types、cron、store、manager、tool facade 的职责，并记录本轮保持调度语义不变

### Requirement: Background task boundary corrections MUST record adopted and deferred module splits
BackgroundTask 边界校正 MUST 在学习沉淀文档中记录本轮采纳的 types、runner、manager 与 tool facade 划分，以及暂不引入持久化或不顺手重构 subagent 的原因。

#### Scenario: 完成 BackgroundTask 后台任务模块边界收口
- **WHEN** 仓库完成 BackgroundTask 内部边界拆分
- **THEN** 学习沉淀文档说明 types、runner、manager、tool facade 的职责，并记录本轮保持后台任务语义不变

### Requirement: Subagent boundary corrections MUST record adopted and deferred module splits
Subagent 边界校正 MUST 在学习沉淀文档中记录本轮采纳的 types、executor、manager 与 tool facade 划分，以及暂不引入持久化、取消执行或更细 notification store 的原因。

#### Scenario: 完成 Subagent 子代理模块边界收口
- **WHEN** 仓库完成 Subagent 内部边界拆分
- **THEN** 学习沉淀文档说明 types、executor、manager、tool facade 的职责，并记录本轮保持工具权限、通知语义和 in-memory 生命周期不变

### Requirement: Delivery boundary corrections MUST record adopted and deferred module splits
Delivery 边界校正 MUST 在学习沉淀文档中记录本轮采纳的 plan、runner、report store 与 public facade 划分，以及暂不改变验证语义的原因。

#### Scenario: 完成 Delivery 交付验证模块边界收口
- **WHEN** 仓库完成 Delivery 模块边界拆分
- **THEN** 学习沉淀文档说明 plan、runner、report store、public facade 的职责，并记录本轮保持 stage plan、failure classify、retry 和 report shape 不变

### Requirement: QueryModel boundary corrections MUST record adopted and deferred module splits
QueryModel 边界校正 MUST 在学习沉淀文档中记录本轮采纳的 request、fallback、recovery 与 public orchestration 划分，以及暂不改变模型请求和恢复语义的原因。

#### Scenario: 完成 QueryModel 模型请求模块边界收口
- **WHEN** 仓库完成 QueryModel 模块边界拆分
- **THEN** 学习沉淀文档说明 request、fallback、recovery、public orchestration 的职责，并记录本轮保持 model policy、fallback、compact、continuation、backoff 和 stopReason 语义不变

### Requirement: QueryToolStage boundary corrections MUST record adopted and deferred module splits
QueryToolStage 边界校正 MUST 在学习沉淀文档中记录本轮采纳的 hooks、executor、task sync 与 stage orchestration 划分，以及暂不改变工具执行和 hook 语义的原因。

#### Scenario: 完成 QueryToolStage 工具执行阶段边界收口
- **WHEN** 仓库完成 QueryToolStage 模块边界拆分
- **THEN** 学习沉淀文档说明 hooks、executor、task sync、stage orchestration 的职责，并记录本轮保持 tool call order、tool result shape、hook blocked output、security event 和 task/todo sync 语义不变

