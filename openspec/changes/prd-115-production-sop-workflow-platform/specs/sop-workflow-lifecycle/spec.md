## ADDED Requirements

### Requirement: Authoritative server-side drafts
BFF SHALL 提供 SOP 草稿 CRUD、自动保存和乐观并发控制；服务端存储 SHALL 是权威数据源，浏览器缓存只用于未提交恢复。

#### Scenario: Save with a stale revision
- **WHEN** 客户端使用旧 revision 保存已被更新的草稿
- **THEN** BFF 返回冲突和最新 revision，不得静默覆盖较新数据

### Requirement: Immutable publish versions
系统 SHALL 为每次发布创建不可变版本，记录版本号、内容 hash、创建者、说明、编译结果和依赖版本。

#### Scenario: Edit after publish
- **WHEN** 用户修改已发布工作流的当前草稿
- **THEN** 已发布版本保持不变，外部触发仍执行原版本直到用户再次发布

### Requirement: Version diff rollback and promotion
系统 SHALL 支持比较版本、查看节点/边/配置差异、将历史版本恢复为新草稿，并 SHALL 通过显式发布完成回滚。

#### Scenario: Roll back a broken release
- **WHEN** 用户选择历史版本并执行回滚
- **THEN** 系统创建来源明确的新草稿，用户确认发布后产生新的不可变版本，而不是修改历史记录

### Requirement: Safe import export and migration
系统 SHALL 支持带 schemaVersion 的 JSON 导入导出、v1 草稿迁移、未知节点保留和导入前预检。

#### Scenario: Import a workflow with unsupported nodes
- **WHEN** 导入文件包含当前环境未安装的节点类型
- **THEN** 系统保留原始节点配置并标记 unsupported，阻止发布但允许用户查看和修复

### Requirement: Versioned workflow templates
系统 SHALL 支持从已发布版本创建模板、从模板创建草稿，并 SHALL 记录模板来源和参数化输入。

#### Scenario: Create a workflow from a template
- **WHEN** 用户选择一个模板并填写必需参数
- **THEN** 系统创建独立草稿，保留来源元数据且后续模板更新不直接覆盖该草稿

### Requirement: Workflow API and Agent references
系统 SHALL 提供按发布版本运行的 Workflow API，并 SHALL 允许 Agent 草稿通过稳定 workflow id 和版本策略引用 SOP。

#### Scenario: Agent uses a pinned workflow version
- **WHEN** Agent 配置引用固定的 workflow version
- **THEN** Agent 运行始终调用该版本，新的工作流发布不会自动改变 Agent 行为

### Requirement: Transactional local persistence
BFF SHALL 使用带迁移和事务的本地数据库持久化草稿、版本、运行、事件与检查点，并 SHALL 支持备份和恢复。

#### Scenario: Process stops during a publish transaction
- **WHEN** BFF 在版本写入过程中异常退出
- **THEN** 数据库恢复后要么完整存在该版本，要么完全不存在，不得留下半发布状态
