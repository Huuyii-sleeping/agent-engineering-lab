## Why

`prd-113`（all-in-one agent builder）已实现第一阶段：用「点击拼装 skill + SOP 步骤」的方式在 Agent 详情里组合配置。但这种方式本质是**线性清单拼装**，无法表达"开始 → 条件分支 → 并行处理 → 人工审批 → 结束"这类有分支、有循环的Standard Operating Procedure（SOP）。

用户现在明确要求把 Agent Builder **重命名为 SOP Builder**，并把核心交互从"拼 config"改为**基于 DAG（有向无环图）的可视化编排**：节点拖拽、连线定义执行流、节点配置面板、连线条件、流程校验。这更贴合"SOP"的语义，也和现有 skill / agents 草稿页形成一致的能力矩阵（skill 是原子能力，SOP 是编排后的流程，agent 引用二者）。

本变更 **supersede** `prd-113` 中"拼装交互"的设计意图（prd-113 的其他部分——介绍页、Agent 管理 CRUD——仍有效，不在本变更范围）。

## What Changes

In Scope:
- 将侧边栏与 tab 的「Agent Builder」重命名为 **SOP Builder**。
- 用 SOP Builder 视图**替换**原 BuilderView 的"点击拼装"交互：
  - **列表页**：进入 tab 优先展示已创建的 SOP 列表（卡片网格 + 顶部筛选工具条 + 右上角「新建流程」）。
  - **画布编辑器**：点击「新建流程」或卡片「编辑」进入，基于 **React Flow（`@xyflow/react` v12）** 实现 DAG 画布。
- 画布能力（v1）：
  - 左侧节点库拖拽入画布；
  - 节点间连线定义执行流；
  - 节点类型：开始 / 结束 / 处理 / AI 调用 / 条件判断 / 人工审批；
  - 点击节点在右侧配置面板编辑名称、类型相关参数（如 AI 节点的 model）与连线条件（条件节点）；
  - 流程校验：单一起点、可达性、无悬挂节点、无环。
- v1 数据：SOP 以**前端本地草稿** store 承载（dev 模式下用 mock 数据），视觉对齐现有 skill / agents 草稿页。

Out of Scope:
- BFF SOP 持久化 API（本变更 v1 保持 web 本地草稿，与 prd-113 的"第一阶段以 Web 前端本地状态实现"一致；持久化作为 follow-up）。
- SOP 执行 / runtime 接线（不把 SOP 注入 agent runtime 或系统提示词）。
- 把 SOP 真正绑定进 agent 草稿的可执行流程（v1 仅"可在 agent 草稿中引用/配置使用"的视觉与数据结构预留，不实现执行）。
- 多 agent 协同执行、SOP 模板市场、导入导出、远端发布。

## Impact

- `prd-113` 中 BuilderView 的"点击拼装"交互被 DAG 画布取代；Agent 管理 / 聊天测试等其余能力不受影响。
- Web Console 能力矩阵变为：介绍页 → Agent 管理 →（Agent 详情可引用）Skill + SOP；SOP Builder 作为独立 tab 提供流程编排。
- 后续可在本变更基础上接 BFF SOP 持久化、SOP 执行引擎与 agent runtime 注入。
