## Why

`prd-114` 已验证 SOP DAG 画布的核心交互，但当前仍是前端本地草稿：节点契约宽松、没有统一变量系统、没有后端版本与运行记录，也不能真正编译、执行、暂停、恢复和治理。若继续只在画布层追加功能，会形成一个“能画但不能可靠运行”的编辑器，因此需要参照 Coze / Dify 的工作流心智，把 SOP 建设为本地优先、可执行、可发布、可观测的生产级工作流平台。

## What Changes

### In Scope

- 建立版本化工作流契约：`schemaVersion`、判别联合节点配置、类型化输入/输出端口、变量引用、凭据引用、运行策略和迁移机制。
- 将 React Flow 降为展示与交互适配层，新增共享 workflow core、节点注册表、图编译器和稳定的编辑器状态层；拆分当前大型 `SopCanvas`。
- 提供接近 Coze / Dify 心智的生产节点体系：输入/输出、LLM、工具、HTTP、代码、条件/分支、模板转换、变量赋值/聚合、知识检索、并行汇聚、迭代、循环、人工审批、子流程和 Agent 节点。
- 新增 BFF SOP 领域：草稿 CRUD、自动保存、乐观并发、不可变发布版本、版本差异/回滚、导入导出、模板和运行查询 API。
- 新增 Agent CLI workflow runtime：编译发布版本、拓扑调度、节点执行器注册表、变量上下文、流式事件、单节点试运行、完整运行、取消、超时、重试、失败分支、检查点与恢复。
- 支持手动、API、Webhook、计划任务和内部事件触发；支持长运行流程中的人工输入/审批暂停与恢复。
- 提供运行历史、节点级输入输出、耗时、token/成本、错误链、变量检查器、从失败节点重试和脱敏后的调试信息。
- 提供生产治理：凭据与环境变量、最小权限、审计、限流、并发配额、循环/深度上限、HTTP 出站策略、代码沙箱、敏感字段脱敏和数据保留策略。
- 提供发布与集成入口：Workflow API、SSE 运行事件、Agent 草稿引用、模板复用，以及后续节点插件 SDK 的稳定边界。
- **BREAKING**：现有 `localStorage` SOP v1 草稿迁移到带 `schemaVersion` 的服务端版本化模型；提供一次性迁移与 JSON 兼容导入，不继续把浏览器存储作为权威数据源。

### Out of Scope

- 实时多人协同编辑、光标跟随和 CRDT。
- 云端多租户计费、公共工作流市场和跨组织分享。
- 完整 BPMN 2.0 兼容或与 Coze / Dify 文件格式一比一互导。
- 未经沙箱、权限和资源限制的任意代码执行。
- 一次性实现所有节点；节点按阶段和生产门槛逐批交付。

## Capabilities

### New Capabilities

- `sop-workflow-authoring`: 版本化图模型、节点注册表、类型化端口、变量系统、画布编辑、单节点调试和大图交互。
- `sop-workflow-runtime`: 工作流编译、节点调度、变量上下文、失败处理、流式运行、暂停恢复、触发器和长任务执行。
- `sop-workflow-lifecycle`: 草稿持久化、自动保存、版本发布、差异回滚、导入导出、模板、API 与 Agent 引用生命周期。
- `sop-workflow-observability-governance`: 运行历史、节点追踪、变量检查、重试回放、凭据、权限、安全策略、审计、配额和数据治理。

### Modified Capabilities

<!-- 本变更以工作流专属能力新增，不修改现有通用 capability 的既有需求。 -->

## Impact

- Web：`apps/web-console/src/features/sop/**` 将按 editor、nodes、inspector、runs、versions、hooks、lib 拆分；React Flow 保留为画布引擎。
- BFF：新增 `apps/bff/src/sops/**`、`apps/bff/src/workflow-runs/**`，controller 保持薄适配；引入事务型工作流存储与迁移。
- Agent：新增 `apps/agent-cli/src/workflows/**`，复用现有工具执行、安全、审计、调度和事件流能力。
- Shared：新增共享 workflow contracts/core 包，并更新 `pnpm-workspace.yaml`，避免 Web、BFF、Agent 重复定义近似类型。
- API：新增 `/api/sops`、`/api/sops/:id/versions`、`/api/workflow-runs`、运行事件流与控制接口。
- 数据：浏览器本地草稿迁移至服务端版本化存储；运行记录、检查点、审计和保留策略会新增持久化数据。
- 依赖：预计新增 schema 校验、持久化迁移、自动布局和执行队列相关依赖，具体选择在设计阶段固定。
