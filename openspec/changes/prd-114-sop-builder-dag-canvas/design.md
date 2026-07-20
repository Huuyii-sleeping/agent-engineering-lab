## Decisions

1. DAG 画布库采用 **React Flow（`@xyflow/react` v12，MIT）**。
   - 理由：内置拖拽 / 缩放 / 平移、自定义节点与边、暗色模式、TypeScript 一等支持；33k+ stars、生态最成熟，开发量最小且稳定。与现有 React + Vite + Tailwind 技术栈天然契合。
   - 备选（不采用）：
     - **自研轻量画布**：可控性最高，但需重造拖拽 / 缩放 / 连线 / 命中检测，工作量大、易出交互 bug，本阶段不划算。
     - **AntV X6**：功能最强（ER / BPMN / 对齐线 / 历史记录），但偏重型、命令式 API 与 React 声明式风格不符，属于杀鸡用牛。

2. **完全替换**原 Agent Builder 的"点击拼装"交互，而非并存。
   - 理由：用户明确"将 Agent Builder 重命名为 SOP Builder，核心交互从拼 config 改为 DAG 编排"。原拼装模型无法表达分支 / 并行，继续并存会多出一套要维护的界面，且语义冲突（同一个 tab 两种编排心智）。
   - 影响：原 `BuilderView.tsx` 的 skill-pick / sop-step 线性组合被移除；`agent-builder.ts` 中 `AgentBuilderConfig.selectedSopStepIds` 的"SOP 步骤"概念被"DAG 节点 + 边"取代（数据模型见下）。

3. v1 节点类型：**开始 / 结束 / 处理 / AI 调用 / 条件判断 / 人工审批**（全选）。
   - 理由：覆盖"SOP"最常见骨架（入口 → 处理/AI → 条件分支 → 人工审批 → 出口），且条件节点的出边可配"是/否"条件，满足分支表达。
   - 后续可扩展：子流程节点、延迟/定时器、Webhook、并行汇聚（AND-join）等，作为 follow-up。

4. SOP 数据模型（v1，前端本地草稿）。
   - 理由：与 prd-113 决策"第一阶段以 Web 前端本地状态实现"一致，先把交互与数据模型跑通，持久化（BFF API）作为 follow-up，降低风险。
   - 草稿仅保存稳定 id 与用户输入，不保存派生展示文本（与 agents 草稿一致）。

5. 视觉严格对齐现有 Orbit 设计令牌。
   - 主色黑白色，彩色仅用于**状态语义**（如节点类型用不同色区分、校验通过=绿、警告=琥珀）。
   - 列表页卡片网格、顶部工具条、右上「新建流程」按钮与 skill / agents 草稿页同源样式，保证三页一致。

## UI Structure

```text
┌──────────────────────────────────────────────────────────┐
│ Sidebar · SOP Builder（原 Agent Builder 重命名）           │
├──────────────────────────────────────────────────────────┤
│ SOP Builder                                                   │
│  ┌─ 列表页（默认）─────────────────────────────────┐  │
│  │ 顶部工具条：筛选（全部/草稿/已发布）+ 新建流程 │  │
│  │ SOP 卡片网格（accent 色条 + 类型图标 + 状态 pill）│  │
│  └───────────────────────────────────────────────────┘  │
│  ┌─ 画布编辑器（点新建/编辑进入）───────────────┐  │
│  │ 左：节点库（拖拽）  中：DAG 画布  右：节点配置 │  │
│  │ 画布顶栏：流程名 / 校验 / 缩放 / 保存 / 返回    │  │
│  └───────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Data Sketch

```ts
type SopNodeType = "start" | "process" | "ai" | "condition" | "approval" | "end";

type SopNode = {
  id: string;            // 稳定 id（如 n1, n2… 或 uuid）
  type: SopNodeType;
  name: string;           // 用户可改的展示名
  position: { x: number; y: number };
  data: {
    model?: string;       // 仅 ai 节点：模型名
    condition?: string;    // 仅 condition 节点：出边默认条件表达式
    note?: string;
  };
};

type SopEdge = {
  id: string;
  source: string;         // 源节点 id
  target: string;         // 目标节点 id
  condition?: string;      // 分支条件（如「是」「否」）
};

type SopDraft = {
  id: string;
  name: string;
  status: "draft" | "published";
  nodes: SopNode[];
  edges: SopEdge[];
  createdAt: number;
  updatedAt: number;
};
```

## Follow-up Path

1. BFF SOP 持久化 API（`GET/POST/PUT/DELETE /api/sops`，镜像 agents）。
2. SOP 执行引擎：拓扑排序、条件路由、人工审批挂起。
3. 把 SOP 注入 agent runtime / system prompt。
4. SOP 模板库、导入导出、远端发布与复用。
5. 节点类型扩展（子流程、并行汇聚、Webhook、定时）。
