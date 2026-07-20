## Context

当前 SOP Builder 已具备 React Flow DAG 画布、6 类节点、本地草稿、基础校验、连线箭头、智能吸附、节点配置和 JSON 导入导出，但存在明确的生产化缺口：

- `SopCanvas.tsx` 超过 1000 行，画布状态、领域转换、节点配置、导入导出和交互逻辑耦合。
- `SopNode` 只有少量可选字段，没有节点判别联合、端口 schema、变量引用、凭据引用和版本迁移。
- 草稿权威数据在浏览器 `localStorage`，没有并发控制、不可变发布版本、回滚和审计。
- Web、BFF、Agent 没有共享 workflow contract；BFF 没有 SOP 业务域，Agent 没有工作流编译和执行引擎。
- 校验只覆盖基础 DAG，不覆盖端口类型、变量可达性、节点配置、资源上限、触发器和运行策略。
- 没有单节点试运行、完整执行、事件流、变量检查器、运行历史、失败恢复、凭据和安全边界。

Coze / Dify 的共同产品心智不是“更多节点”，而是四个闭环：可视化编排、变量与节点契约、调试执行、发布治理。Dify 官方文档明确提供单节点运行、变量检查器、运行历史、错误处理、迭代、循环、触发器、人工输入、Workflow API 和流式事件；本设计将这些能力映射到 Orbit 的本地优先架构，而非复制其界面。

## Goals / Non-Goals

**Goals:**

- 建立 Web、BFF、Agent 共享且可迁移的工作流契约。
- 让编辑器能可靠表达、校验和调试生产流程，而不仅是绘图。
- 让发布版本可由 Agent CLI 确定性执行、暂停、恢复、取消和重试。
- 让运行具备节点级可观测性、安全策略、资源上限和审计。
- 按阶段交付，每个阶段都有明确的可验收出口，不制造长期半成品。

**Non-Goals:**

- 不在本变更实现实时多人协同和 CRDT。
- 不追求节点数量或文件格式与 Coze / Dify 一比一对齐。
- 不允许顶层任意环；循环只存在于受限的 Loop / Iteration 容器节点内部。
- 不让 Web 或 BFF controller 承担节点业务执行。
- 不开放绕过沙箱、凭据和出站策略的任意代码/网络执行。

## Decisions

### 1. 四层边界：contracts/core、Web authoring、BFF control plane、Agent runtime

- 新增 `packages/workflow-core`，并让 `pnpm-workspace.yaml` 纳入 `packages/*`。
- `workflow-core` 只包含版本化类型、schema 校验、图算法、编译 IR、事件契约和纯函数，不依赖 React、Nest 或 Agent 运行时。
- Web 使用 React Flow 映射 core 模型，负责编辑、校验展示、调试控制和运行观察。
- BFF 负责草稿、版本、模板、凭据引用、运行索引和 REST/SSE 控制面。
- Agent CLI 负责节点执行器、调度、工具调用、模型调用、检查点和恢复。

备选：所有逻辑放在 Web/BFF。未采用，因为会重复类型、让 controller 变厚，并绕开现有 Agent 工具执行与安全边界。

### 2. 版本化、判别联合的工作流模型

核心实体分为 `WorkflowDraft`、`WorkflowVersion`、`WorkflowNode`、`WorkflowEdge`、`WorkflowRun`、`NodeRun`、`WorkflowCheckpoint`。所有定义携带 `schemaVersion`；节点配置使用 `type` 判别联合；端口携带数据类型与是否必填；变量引用使用稳定路径而非插值字符串。

发布时将草稿规范化并生成不可变版本快照与内容 hash。运行永远引用发布版本，不直接读取可变草稿。

备选：继续扩展可选字段对象。未采用，因为无法穷尽校验、迁移和执行分支，TypeScript 也不能保证节点契约。

### 3. 节点注册表统一 authoring、validation 与 execution identity

每种节点通过 `NodeDefinition` 注册：类型、版本、分类、图标、端口工厂、配置 schema、静态校验器、默认值、Web inspector 标识和 Agent executor 标识。Web 组件和 Agent executor 不放入共享包，只通过稳定 id 绑定。

节点分批交付：

1. P0：Start/Input、End/Output、LLM、Tool、HTTP、Code、Condition/Switch、Template、Variable Assign/Aggregate、Knowledge Retrieval。
2. P1：Parallel/Merge、Iteration、Loop、Human Approval、Subworkflow、Agent。
3. P2：Webhook/Schedule/Event Trigger、Database、File Parser、Messaging、Batch。

备选：在各端用 switch 维护节点。未采用，因为会快速产生不一致和重复类型。

### 4. 顶层 DAG + 受限容器子图

顶层工作流必须是 DAG。Parallel、Iteration、Loop、Subworkflow 使用显式容器/子图语义：

- Iteration 对数组元素执行内部 DAG，可配置并发和失败策略。
- Loop 以最大次数、超时和终止表达式为硬限制。
- Parallel 产生分支，Merge 明确聚合策略。
- Subworkflow 只引用已发布版本，防止运行中定义漂移。

备选：允许任意回边。未采用，因为循环终止、可达性、恢复和静态分析会显著复杂化。

### 5. 发布前编译为不可变 Workflow IR

编译器执行：schema 迁移、节点配置校验、端口类型检查、变量作用域解析、图合法性、资源预算估算、执行拓扑生成和 executor 绑定。编译错误阻止发布；警告允许用户确认后发布。

备选：运行时直接解释 React Flow JSON。未采用，因为错误发现过晚，也让执行依赖 UI 数据结构。

### 6. Agent CLI 使用持久状态机执行

运行状态采用 `queued -> running -> waiting -> succeeded | failed | cancelled`；节点状态采用 `pending -> ready -> running -> waiting -> succeeded | failed | skipped | cancelled`。调度器只调度依赖满足的节点，使用 executor registry 执行节点，并通过共享事件契约输出 SSE 事件。

错误策略支持：终止、有限重试、默认值继续、进入 error handle。所有重试必须区分幂等与非幂等节点。

备选：简单递归调用节点。未采用，因为无法支持并行、取消、检查点、恢复和运行观察。

### 7. SQLite 作为本地生产存储，Repository 隔离驱动

BFF 新增 workflow repository，默认使用 SQLite WAL、显式迁移和事务；浏览器 localStorage 与现有 JSON store 只作为迁移来源。存储表至少覆盖 drafts、versions、runs、node_runs、events、checkpoints、credentials metadata、audit records。

驱动优先选择成熟的 `better-sqlite3`，在实施第一阶段先完成 Node 22 / macOS / Linux 构建兼容性验证；Repository 接口允许替换驱动。

备选：继续写单个 JSON 文件。未采用，因为发布、运行事件、并发写入和恢复需要事务与查询能力。

### 8. 变量系统使用显式作用域与类型

变量分为 workflow input、node output、system、environment、secret、loop item、conversation/agent context。编辑器变量选择器只能展示当前节点拓扑上可达的变量；编译器再次验证作用域和类型。Secret 只保存引用，运行事件和日志默认脱敏。

备选：统一使用 `{{node.output}}` 字符串。未采用，因为重命名、类型校验、引用追踪和安全脱敏不可靠。

### 9. 调试分为静态校验、单节点试运行、草稿完整运行

- 静态校验不产生运行记录。
- 单节点试运行要求用户提供未满足的输入，并展示本节点输入、输出、日志和耗时。
- 草稿完整运行编译临时 IR，但标记为 draft run，不能被外部触发。
- 发布运行只执行不可变版本。

备选：只有“校验”和“正式运行”。未采用，因为工作流调试成本过高。

### 10. 生产治理默认开启

- Code 节点复用 Agent 沙箱并限制 CPU、内存、时间、文件和网络。
- HTTP/Tool 节点执行出站策略、SSRF 防护、超时、响应大小和凭据权限检查。
- 凭据值不进入 workflow JSON；API 只返回引用与元数据。
- 所有发布、回滚、运行控制、凭据使用和人工审批写审计。
- 默认限制节点数、并行度、循环次数、运行时长、事件体积和保留周期。

备选：先实现功能再补安全。未采用，因为后补会破坏节点契约和运行模型。

## Delivery Roadmap

| 阶段 | 目标 | 关键交付 | 退出门槛 |
| --- | --- | --- | --- |
| A. 契约与拆分 | 稳定地“描述流程” | workflow-core、schema v2、节点注册表、SopCanvas 拆分、迁移器 | 现有草稿无损迁移；共享契约零重复定义 |
| B. 生产编辑器 | 稳定地“编排流程” | 类型端口、变量选择器、撤销重做、复制粘贴、自动布局、P0 节点、发布前校验 | 200 节点画布可用；非法引用不能发布 |
| C. 持久化与版本 | 稳定地“保存和发布” | SQLite、BFF CRUD、自动保存、并发控制、不可变版本、diff/rollback | 刷新/崩溃不丢草稿；运行版本不可漂移 |
| D. Runtime MVP | 稳定地“运行流程” | compiler IR、顺序/分支调度、LLM/Tool/HTTP/Code、SSE、取消、超时重试 | 发布流程端到端运行；失败可定位到节点 |
| E. 高级编排 | 表达真实 SOP | 并行汇聚、迭代、循环、子流程、Agent、人工审批、检查点恢复 | 长流程可暂停恢复；循环和并发受硬限制 |
| F. 触发与集成 | 从编辑器走向平台 | API/Webhook/Schedule/Event trigger、Workflow API、Agent 引用 | 外部触发幂等；权限与版本固定 |
| G. 可观测与治理 | 达到生产门槛 | run history、变量检查器、重试回放、成本、凭据、审计、配额、保留 | 敏感值不泄漏；崩溃后可恢复；关键操作可审计 |
| H. 生态与体验 | 提升复用效率 | 模板、节点 SDK、导入导出、运行对比、性能抛光 | 新节点不修改画布核心；模板可版本化复用 |

## Risks / Trade-offs

- [范围过大] → 每个阶段单独验收，后续实施可拆成独立增量 change；不得跨阶段跳做 UI 节点。
- [共享包引入 monorepo 复杂度] → workflow-core 保持纯 TypeScript、无运行时框架依赖，并设置依赖方向检查。
- [SQLite 原生驱动兼容性] → 阶段 A 先做 Node 22 与目标平台构建验证，Repository 隔离替换成本。
- [执行器副作用导致重复操作] → 节点声明幂等属性，非幂等节点重试必须显式确认或使用幂等键。
- [运行事件和输入输出泄漏敏感信息] → schema 级敏感标记、默认脱敏、体积上限和保留策略。
- [大图性能退化] → 只渲染可见元素、稳定 selector、节点组件 memo、事件批处理，并以 200 节点/400 边作为首个性能门槛。
- [容器子图增加编辑复杂度] → 先交付顶层 P0，再实现统一的子图编辑器，不为每类容器复制画布。
- [现有草稿迁移失败] → 迁移前导出备份，迁移幂等，保留只读 v1 导入和回滚开关。

## Migration Plan

1. 引入 workflow-core 和 schema v2，不改变现有 UI；建立 v1 -> v2 纯函数迁移与测试。
2. Web 改为读写 v2 adapter，仍可临时保存 localStorage；完成画布拆分。
3. BFF 上线 SQLite repository 与草稿 API；首次启动读取 localStorage 导出或 JSON 导入迁移。
4. 增加发布版本与编译器，运行入口仍保持关闭。
5. Agent runtime 通过 feature flag 上线草稿试运行，再开放发布运行。
6. 运行与观测稳定后，移除 localStorage 权威写入，仅保留导入工具。

回滚时关闭 runtime/trigger feature flag，保留 v2 数据库并让 Web 回到只读版本列表；不得将已发布 v2 数据反向覆盖为 v1。

## Open Questions

- 人工审批第一阶段只支持本地 Web 操作，还是同时接入通知渠道？默认先做 Web inbox。
- P0 的 Knowledge Retrieval 是直接复用 Skill/Tool，还是建立独立知识检索 executor？建议先复用现有能力并保留专用节点契约。
- 节点插件 SDK 在 G 阶段后开放，还是在 P0 就允许第三方节点？建议先稳定内置 registry 接口，再公开 SDK。
- 首个生产上限建议为 200 节点、400 边、并行度 10、循环 1000 次、单次运行 24 小时，需在压测后最终确认。

## Reference Baseline

- Dify Workflow & Chatflow：https://docs.dify.ai/en/cloud/use-dify/build/workflow-chatflow.md
- Dify Orchestration Logic：https://docs.dify.ai/en/cloud/use-dify/build/orchestrate-node.md
- Dify Run History / Single Node / Variable Inspector：https://docs.dify.ai/en/cloud/use-dify/debug/history-and-logs.md
- Dify Workflow API：https://docs.dify.ai/en/api-reference/guides/workflow.md
- Coze Workflow：参考其公开产品中的节点编排、变量引用、试运行、发布和子流程心智，不依赖其私有实现或文件格式。
