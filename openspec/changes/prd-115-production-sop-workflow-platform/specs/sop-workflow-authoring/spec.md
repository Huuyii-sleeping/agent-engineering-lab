## ADDED Requirements

### Requirement: Versioned workflow authoring contract
系统 SHALL 使用带 `schemaVersion` 的共享工作流契约描述草稿、节点、端口、边、变量引用和运行策略，并 SHALL 提供旧版本迁移器。

#### Scenario: Open a legacy SOP draft
- **WHEN** 用户打开 prd-114 产生的 v1 本地草稿
- **THEN** 系统将其迁移为当前 schema，保留节点、位置、连线和可识别配置，并在迁移失败时阻止覆盖原数据

### Requirement: Typed node registry
系统 SHALL 通过节点注册表声明节点类型、版本、配置 schema、输入输出端口、默认值、静态校验器和 executor identity，Web 与 Agent SHALL 复用同一节点 identity。

#### Scenario: Register a new built-in node
- **WHEN** 开发者增加一个符合 NodeDefinition 契约的节点
- **THEN** 节点库、配置校验、编译器和 executor 绑定能够识别该节点，且无需修改画布核心 switch

### Requirement: Typed port connections
编辑器 SHALL 仅允许方向和数据类型兼容的端口建立连线，并 SHALL 在节点配置变化导致端口失效时明确标记已有边。

#### Scenario: Connect incompatible ports
- **WHEN** 用户把 object 输出连接到仅接受 string 的输入端口
- **THEN** 画布拒绝连接并展示可读的类型不兼容原因

### Requirement: Scoped variable selector
编辑器 SHALL 提供变量选择器，只展示拓扑上可达且作用域允许的 workflow input、node output、system、environment、secret 和 loop context 变量。

#### Scenario: Reference an unreachable node output
- **WHEN** 用户尝试在上游节点引用下游节点输出
- **THEN** 变量选择器不提供该变量，编译器也将手工构造的非法引用报告为错误

### Requirement: Production editor operations
画布 SHALL 支持撤销重做、复制粘贴、框选、多选移动、删除、自动布局、缩放定位、搜索节点、折叠容器和键盘可访问操作。

#### Scenario: Undo a multi-node edit
- **WHEN** 用户移动多个节点并删除一条边后执行撤销
- **THEN** 系统按操作事务恢复节点位置和边，且不产生部分恢复状态

### Requirement: Static validation before publish
编辑器 SHALL 在发布前校验图结构、节点配置、端口类型、变量引用、必填输入、资源限制、触发器配置和子流程版本。

#### Scenario: Publish an invalid workflow
- **WHEN** 草稿存在缺失凭据、无效变量或未连接必填输入
- **THEN** 系统阻止发布，将问题定位到对应节点、端口或配置字段

### Requirement: Node and draft test runs
编辑器 SHALL 支持单节点试运行和完整草稿试运行，并 SHALL 展示输入、输出、日志、耗时、token/成本和错误。

#### Scenario: Test a node with missing upstream values
- **WHEN** 用户试运行一个依赖上游输出的节点
- **THEN** 系统提示用户提供缺失输入，运行只执行该节点且不触发正式发布版本
