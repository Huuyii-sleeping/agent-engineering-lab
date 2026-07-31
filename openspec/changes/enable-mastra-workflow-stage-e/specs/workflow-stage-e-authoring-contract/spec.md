## ADDED Requirements

### Requirement: 阶段 E 节点 SHALL 使用版本化判别联合
`workflow-core` SHALL 将 Parallel、Merge、Iteration、Loop、Subworkflow、Agent 和 Human Approval 注册为版本化内置节点。节点配置、端口、默认值、静态校验和 executor identity SHALL 来自共享节点注册表，Web、BFF 和 Agent 不得重复定义近似类型。

#### Scenario: 创建阶段 E 内置节点
- **WHEN** 编辑器从共享注册表创建阶段 E 节点
- **THEN** 草稿保存稳定 node type、node version、配置和端口
- **AND** 编译器与 Agent Runtime 使用同一 executor identity

#### Scenario: 旧客户端读取新节点
- **WHEN** 不支持该 node type 的旧客户端读取阶段 E 草稿
- **THEN** 客户端按 unknown node 无损保留原始配置
- **AND** 不得静默删除或改写节点

### Requirement: 容器节点 SHALL 使用统一子图契约
Iteration 和 Loop SHALL 使用统一 `WorkflowSubgraph` 持久化内部 nodes、edges、输入绑定和输出绑定。容器内部 SHALL 保持 DAG，容器 MAY 嵌套其他容器，但 SHALL 受全局节点数、估算步骤数和最大嵌套深度约束。

#### Scenario: 编辑 Iteration 内部流程
- **WHEN** 用户进入 Iteration 容器并添加内部节点与连边
- **THEN** 编辑器通过统一子图适配层读写 `WorkflowSubgraph`
- **AND** 不为 Iteration 单独维护另一套画布数据模型

#### Scenario: 容器内部出现任意回边
- **WHEN** 子图包含未由 Loop 节点表达的回边
- **THEN** 发布校验报告精确到容器、节点和边的错误
- **AND** 阻止生成 Workflow IR

### Requirement: Parallel 与 Merge SHALL 显式声明分支和聚合策略
Parallel 节点 SHALL 使用稳定 branch id 和输出端口声明静态分支，并 SHALL 配置 `maxConcurrency` 与失败策略。Merge 节点 SHALL 明确引用对应 Parallel 节点并声明聚合顺序、缺失分支和失败结果处理策略。

#### Scenario: 发布受限并行分支
- **WHEN** Parallel 定义 12 个分支且 `maxConcurrency = 10`
- **THEN** 编译器接受静态分支数量
- **AND** IR 记录运行时并发不得超过 10

#### Scenario: Merge 不匹配 Parallel
- **WHEN** Merge 引用不存在的 Parallel 或缺少活动分支输入
- **THEN** 发布校验阻止发布
- **AND** 诊断定位到 Merge 配置和相关端口

### Requirement: Iteration 与 Loop SHALL 定义受限变量作用域
Iteration SHALL 提供只读 `item`、`index` 和容器输入作用域；Loop SHALL 提供显式初始变量、当前迭代值和 iteration count。容器内部变量不得越过声明的输入输出绑定访问外部不可达节点或泄漏内部临时状态。

#### Scenario: Iteration 引用当前元素
- **WHEN** 内部节点引用当前 Iteration 的 `item` 与 `index`
- **THEN** 变量选择器展示类型化变量
- **AND** 编译器将引用绑定到对应容器实例

#### Scenario: 外部节点读取容器内部临时变量
- **WHEN** 容器外节点直接引用未声明为容器输出的内部变量
- **THEN** 编译器报告作用域错误并阻止发布

### Requirement: Subworkflow SHALL 固定不可变发布版本
Subworkflow 节点 SHALL 保存 workflowId、versionId、contentHash、输入绑定和输出绑定。发布 SHALL 校验目标版本存在且不可变，并 SHALL 检测直接或间接递归和最大嵌套深度。

#### Scenario: 子流程发布后产生新版本
- **WHEN** 父 Workflow 已引用子流程版本 A，子流程随后发布版本 B
- **THEN** 父 Workflow 继续引用版本 A
- **AND** 只有显式编辑和重新发布才能切换版本

#### Scenario: 检测间接递归
- **WHEN** Workflow A 引用 B，B 的依赖链再次引用 A
- **THEN** 编译器报告递归依赖路径
- **AND** 阻止发布

### Requirement: Agent 与 Human Approval 节点 SHALL 保存产品引用而非 Runtime 对象
Agent 节点 SHALL 保存稳定 Agent profile/version 引用、输入绑定和输出 schema，不得持久化 Mastra Agent 对象或任意客户端 Tool 列表。Human Approval SHALL 保存审批策略引用、展示字段、决策 schema、超时和超时策略，不得保存审批 token 或审批人凭据。

#### Scenario: 发布 Agent 节点
- **WHEN** Agent 节点引用不存在或未发布的 Agent version
- **THEN** 发布校验失败
- **AND** 不在运行时临时选择其他 Agent 作为 fallback

#### Scenario: 导出 Human Approval 节点
- **WHEN** 用户导出包含审批节点的 Workflow
- **THEN** 导出只包含审批策略引用和 schema
- **AND** 不包含 resume token、用户凭据或历史审批决定

### Requirement: AgentVersion SHALL 是不可变产品发布快照
BFF SHALL 从可变 AgentProfile 发布不可变 AgentVersion，并 SHALL 在同一 profile 下分配单调版本号和稳定 version id。版本快照 SHALL 固定 instructions、Tool policy、版本锁定的 Skill policy、output schema、contentHash 和发布审计字段；发布请求不得覆盖这些运行字段。`updatedAt`、Skill 版本拼接和 Mastra definition cache identity 不得充当 AgentVersion。

#### Scenario: 发布 AgentProfile
- **WHEN** 用户发布一个当前有效的 AgentProfile
- **THEN** repository 新增不可变 AgentVersion，旧版本保持不变
- **AND** contentHash 由规范化版本快照确定

#### Scenario: 发布后继续编辑 AgentProfile
- **WHEN** AgentProfile 在版本 A 发布后修改 instructions 或 Skill bindings
- **THEN** 已发布版本 A 的快照和 contentHash 不变
- **AND** 只有再次发布生成版本 B 才能供 Workflow 选择新配置

### Requirement: AgentVersion catalog 与 resolver SHALL 共用同一 identity
BFF SHALL 提供只读 AgentVersion catalog/detail API，Web SHALL 只允许从 catalog 选择已发布版本。共享 resolver SHALL 通过 `agentProfileId + agentVersionId` 返回同一不可变快照；SOP 发布和 Runtime 解析 SHALL 校验 profile、version 与 contentHash 一致，不得 fallback 到当前 AgentProfile。

#### Scenario: Workflow 选择已发布版本
- **WHEN** 用户在 Agent 节点选择 catalog 中的版本
- **THEN** Web 写入对应 agentProfileId、agentVersionId 和版本 output schema
- **AND** 发布校验通过共享 resolver 确认同一版本仍存在且可用

#### Scenario: 客户端伪造版本引用
- **WHEN** 节点提交不存在、profile 不匹配或 contentHash 不匹配的 Agent version
- **THEN** 发布与运行在启动子 Agent 前失败
- **AND** 不改用当前 profile、其他版本或默认 Agent

### Requirement: Agent output schema SHALL 由发布版本固定
AgentVersion SHALL 是 output schema 的唯一权威来源。Agent 节点 MAY 冗余保存同一 schema 以支持自描述编辑和编译，但 SHALL 不允许 Workflow 改写；发布 resolver SHALL 对节点 schema 与版本快照执行确定性相等校验。

#### Scenario: 选择 AgentVersion
- **WHEN** Web 将已发布版本绑定到 Agent 节点
- **THEN** inspector 只读展示并写入该版本的 output schema
- **AND** 用户不能在 Workflow 中为同一版本声明另一 schema

#### Scenario: 节点 schema 与版本不一致
- **WHEN** 导入或旧客户端提交的 Agent 节点 output schema 与版本快照不同
- **THEN** 发布校验定位到该 Agent 节点的 outputSchema 字段并阻止发布
