> 执行原则：严格按阶段推进，每阶段完成构建、单测、smoke 和用户验收后再进入下一阶段。OpenSpec 维护需求与设计；代码、测试、调试和运行交给 Superpowers 执行。不得跳过 A/C 阶段直接增加高级节点。

## 1. 阶段 A：共享契约与兼容性基线

- [x] 1.1 更新 `pnpm-workspace.yaml` 纳入 `packages/*`，创建纯 TypeScript 的 `packages/workflow-core` 包和构建/测试配置。
- [x] 1.2 在 workflow-core 定义 `WorkflowDraft / WorkflowVersion / WorkflowNode / WorkflowEdge / NodePort / VariableRef / CredentialRef` v2 契约。
- [x] 1.3 使用判别联合定义 Start、End、LLM、Tool、HTTP、Code、Condition、Template、Variable、Knowledge 节点配置。
- [x] 1.4 定义 `NodeDefinition`、节点版本、端口工厂、配置 schema、validator 与 executor identity 注册契约。
- [x] 1.5 实现 schemaVersion 规范化、稳定序列化、内容 hash 和未知节点保留模型。
- [x] 1.6 实现 prd-114 `SopDraft` v1 -> workflow v2 的幂等迁移器与反复迁移测试。
- [x] 1.7 把 DAG、可达性、环检测和基础图算法迁移到 workflow-core，并补齐纯函数单测。
- [x] 1.8 定义编译诊断结构，支持 workflow/node/port/field/edge 精确定位和 error/warning 分级。
- [x] 1.9 完成 `better-sqlite3` 在 Node 22、macOS、Linux CI 环境的构建兼容性 spike，记录采用或替换结论到 design。
- [x] 1.10 建立 Web、BFF、Agent 对 workflow-core 的依赖方向检查，禁止三端重复定义近似工作流类型。
- [x] 1.11 运行 workflow-core build/test，并验证 v1 mock 草稿无损迁移为 v2。

## 2. 阶段 A：Web 编辑器边界收口

- [x] 2.1 将 `SopCanvas.tsx` 拆分为 canvas shell、toolbar、palette、inspector、alignment overlay、JSON panel 和 selection actions。
- [x] 2.2 将 React Flow Node/Edge 与 workflow-core 模型之间的转换放入独立 adapter，React 组件不得持有持久化模型规则。
- [x] 2.3 新增 editor state hook/store，集中处理 nodes、edges、selection、viewport、validation、dirty revision 和调试状态。
- [x] 2.4 将节点配置面板按节点类型拆入 `features/sop/nodes/<type>/**`，通用字段复用共享组件。
- [x] 2.5 将节点库改为读取 NodeDefinition registry，不再维护独立 catalog switch。
- [x] 2.6 接入 v1 -> v2 迁移适配，保留旧 localStorage 只读备份与显式导出入口。
- [x] 2.7 为 editor adapter、selection、迁移和节点 registry 增加 Web 单元测试。
- [x] 2.8 验证入口文件与顶层画布文件满足工作区薄入口和单文件职责规则。

## 3. 阶段 B：生产级编排体验

- [x] 3.1 实现类型化 Handle/Port 渲染、兼容性命中提示和无效连线原因展示。
- [x] 3.2 实现 workflow input、node output、system、environment、secret 变量作用域解析。
- [x] 3.3 实现变量选择器、变量搜索、类型展示、引用插入和失效引用定位。
- [x] 3.4 实现节点配置变化后的端口重算，并将失效边标记为待修复而非静默删除。
- [x] 3.5 实现事务级 undo/redo，覆盖节点/边/配置/批量操作，至少保留 100 步。
- [x] 3.6 完成复制粘贴、跨工作流粘贴 id 重写、框选、多选移动和键盘快捷键。
- [x] 3.7 接入自动布局，支持横向/纵向方向、选中子图布局和保持用户固定节点。
- [x] 3.8 实现节点搜索定位、错误列表定位、容器折叠和 fit selection。
- [x] 3.9 完成 P0 节点的 Web inspector：Start/Input、End/Output、LLM、Tool、HTTP、Code、Condition/Switch、Template、Variable Assign/Aggregate、Knowledge Retrieval。
- [x] 3.10 实现发布前完整静态校验，并在画布、问题面板和字段级同时展示诊断。
- [x] 3.11 增加 200 节点/400 边编辑性能 fixture，开启可见元素渲染、memo 和状态 selector 优化。
- [x] 3.12 执行 Web 编辑器 smoke：创建、连接、变量引用、复制、撤销、自动布局、校验和 v1 导入。

## 4. 阶段 C：BFF 持久化与版本生命周期

- [x] 4.1 新增 `apps/bff/src/sops/` 领域模块、薄 controller、service、repository 接口和公开类型注释。
- [x] 4.2 建立 SQLite 连接、WAL、迁移表和 drafts/versions/templates 基础 schema。
- [x] 4.3 实现草稿 list/get/create/update/delete API 和 revision 乐观并发控制。
- [x] 4.4 实现自动保存 API、dirty revision、冲突响应和 Web 端冲突恢复界面。
- [x] 4.5 实现发布事务：规范化、编译预检、内容 hash、不可变版本和发布说明。
- [x] 4.6 实现版本列表、版本详情、结构化 diff 和“从历史版本创建新草稿”。
- [x] 4.7 实现带 schemaVersion 的导入预检、导出、未知节点保留和 v1 数据迁移 API。
- [x] 4.8 实现版本化模板 CRUD、模板参数 schema 和从模板创建草稿。
- [x] 4.9 将 Web SOP 列表/编辑器切换到 BFF 权威数据源，localStorage 仅保留未提交恢复缓存。
- [x] 4.10 为 repository 事务、并发冲突、发布原子性、迁移和回滚增加 BFF 单元/集成测试。
- [x] 4.11 增加数据库备份/恢复命令与损坏数据库的可读失败提示。
- [x] 4.12 完成阶段 C 验收：刷新/重启不丢草稿，历史发布版本不可被修改。

## 5. 阶段 D：编译器与 Runtime MVP

- [ ] 5.1 在 workflow-core 定义 Workflow IR、execution topology、resource budget 和 executor binding。
- [ ] 5.2 实现编译流水线：迁移、schema、节点、端口、变量、图、限制、依赖版本和 executor 校验。
- [ ] 5.3 在 `apps/agent-cli/src/workflows/` 创建 compiler adapter、runtime、scheduler、context、events 和 executors 边界。
- [ ] 5.4 定义 WorkflowRun/NodeRun 状态机、合法状态转换和终态不可逆规则。
- [ ] 5.5 实现顺序 DAG 调度、Condition/Switch 分支、skipped 传播和 Output 收集。
- [ ] 5.6 实现变量上下文、节点输出写入、类型校验、system/environment/secret 解析。
- [ ] 5.7 实现 LLM executor，复用现有模型策略、预算、流式输出和错误契约。
- [ ] 5.8 实现 Tool executor，复用现有工具权限、审批、审计和执行链路。
- [ ] 5.9 实现 HTTP executor，包含超时、响应上限、SSRF 防护、credential reference 和结构化输出。
- [ ] 5.10 实现 Code executor，复用沙箱并限制 CPU、内存、时间、文件和网络。
- [ ] 5.11 实现 Template、Variable、Condition、Start、Output 基础 executor。
- [ ] 5.12 实现节点超时、幂等声明、有限重试、退避、默认值和 error handle 策略。
- [ ] 5.13 定义并发安全的 workflow runtime event 协议，覆盖 run/node/log/output/waiting 事件。
- [ ] 5.14 为状态机、调度、变量、各 executor 和错误策略创建镜像 `apps/agent-cli/test/unit/workflows/**` 单测。
- [ ] 5.15 增加 Agent runtime smoke：LLM/Tool/HTTP/Code/Condition 组合流程端到端执行。

## 6. 阶段 D：运行控制与 Web 调试

- [ ] 6.1 新增 BFF `workflow-runs` 薄 controller/service，代理 Agent runtime 启动、查询、取消和事件流。
- [ ] 6.2 建立 runs/node_runs/events 数据表和运行索引写入，不在 BFF 重复执行节点逻辑。
- [ ] 6.3 实现运行 SSE 断线续传、事件 id、终态关闭和客户端去重。
- [ ] 6.4 Web 实现单节点试运行输入补全、运行控制和输入/输出/日志/耗时面板。
- [ ] 6.5 Web 实现草稿完整试运行和发布版本运行，明确区分 draft run 与 production run。
- [ ] 6.6 画布实时展示 pending/running/succeeded/failed/skipped/waiting 状态和当前执行路径。
- [ ] 6.7 实现取消运行和可取消 executor 的 AbortSignal 传播。
- [ ] 6.8 增加 BFF 运行 API、SSE 和取消的单元/集成测试。
- [ ] 6.9 完成阶段 D 验收：发布版本可运行、可取消、失败可定位到具体节点与 attempt。

## 7. 阶段 E：高级控制流与长运行流程

- [ ] 7.1 扩展共享模型和 compiler 支持 Parallel 与 Merge 聚合策略。
- [ ] 7.2 runtime 实现受并行度限制的 fan-out/fan-in 调度和部分失败策略。
- [ ] 7.3 实现统一容器子图编辑器，供 Iteration、Loop 和后续容器节点复用。
- [ ] 7.4 实现 Iteration 节点的 item/index 作用域、并发度、结果聚合和失败策略。
- [ ] 7.5 实现 Loop 节点的初始变量、终止表达式、最大次数、超时和输出规则。
- [ ] 7.6 实现 Subworkflow 节点，只允许引用已发布版本并校验递归/深度限制。
- [ ] 7.7 实现 Agent 节点，复用 Agent profile、工具/Skill/SOP 绑定和运行观测。
- [ ] 7.8 实现 Human Approval 节点、waiting 状态、审批 inbox、批准/拒绝和权限检查。
- [ ] 7.9 建立 checkpoints 表和一致检查点写入，支持进程重启后恢复 waiting/running 流程。
- [ ] 7.10 为并行、迭代、循环、子流程、审批和恢复添加单元、崩溃恢复与 smoke 测试。
- [ ] 7.11 完成阶段 E 验收：长流程能暂停/恢复，循环、并行和嵌套均受硬限制。

## 8. 阶段 F：触发器、Workflow API 与 Agent 集成

- [ ] 8.1 定义 TriggerDefinition 与 trigger binding，触发器固定 workflow version 或显式 latest-published 策略。
- [ ] 8.2 实现 Workflow API 启动、blocking/streaming 响应、输入 schema、认证和运行查询。
- [ ] 8.3 实现 Webhook trigger、签名校验、幂等键、限流和重复请求去重。
- [ ] 8.4 实现 Schedule trigger，复用现有 scheduler 的 lease、misfire、next-run 和审计能力。
- [ ] 8.5 实现内部 Event trigger、事件 schema、过滤条件和防递归触发限制。
- [ ] 8.6 在 Agent 草稿中增加 workflow 引用，支持 pinned version 与 latest-published 策略。
- [ ] 8.7 Web 增加触发器管理、API 调用示例、版本策略和最近触发状态。
- [ ] 8.8 为 API/Webhook/Schedule/Event 的认证、幂等、限流和版本固定增加回归测试。
- [ ] 8.9 完成阶段 F 验收：外部触发不会重复执行，Agent 行为不会因未确认发布而漂移。

## 9. 阶段 G：可观测性、安全与治理

- [ ] 9.1 Web 实现运行历史列表、筛选、运行详情、节点时间线和错误定位。
- [ ] 9.2 实现变量检查器，按节点展示脱敏输入、输出、作用域和检查点快照。
- [ ] 9.3 实现从失败节点重试、基于历史输入重跑和 attempt 审计链。
- [ ] 9.4 记录 LLM token/成本、工具耗时、HTTP 指标和 workflow 总体统计。
- [ ] 9.5 新增 credential/environment 管理服务，workflow 定义只保存引用和 capability。
- [ ] 9.6 建立 schema 级敏感字段标记、事件/日志/API/导出的统一脱敏器。
- [ ] 9.7 对查看、编辑、发布、回滚、运行控制、审批和凭据使用增加授权策略与审计。
- [ ] 9.8 实现节点/边/并行度/循环/深度/时长/事件体积/并发运行硬限制和配置入口。
- [ ] 9.9 实现运行数据、事件、检查点和审计数据保留/清理策略及清理报告。
- [ ] 9.10 增加 SSRF、路径越界、secret 泄漏、未授权发布、配额绕过和审计完整性安全测试。
- [ ] 9.11 增加 crash/restart、SSE 重连、数据库备份恢复和非幂等重试故障注入测试。
- [ ] 9.12 完成阶段 G 验收：敏感值零明文泄漏，关键操作可审计，重启后可恢复一致状态。

## 10. 阶段 H：生态、性能与发布收口

- [ ] 10.1 实现版本化工作流模板、参数化创建、来源追踪和模板升级提示。
- [ ] 10.2 稳定 NodeDefinition/Executor 边界并编写内置节点开发指南；暂不开放绕过审核的第三方执行器。
- [ ] 10.3 实现运行对比、版本效果对比和节点级耗时/成本回归视图。
- [ ] 10.4 建立 200 节点/400 边画布、10 并行运行、持续 SSE 和长运行恢复基准。
- [ ] 10.5 将性能、安全、迁移、恢复和关键 smoke 纳入发布门禁。
- [ ] 10.6 完成全量 `pnpm build`、各包单测、对应 smoke、OpenSpec status/validate。
- [ ] 10.7 清理构建/测试产物，输出迁移、备份、回滚、限制和运维文档。
- [ ] 10.8 用户逐阶段验收通过后再提交 Conventional Commit；不执行 push。
