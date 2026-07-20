> 完成说明：SOP Builder（含连线箭头、Handle 对齐、响应式顶栏与智能吸附辅助线优化）已进入「待验收」状态。构建（`pnpm --filter agent-web-console build`）通过，SOP 画布相关单测 8 项通过。提交（7.4）按约定在用户验收后执行，不自动 push。

## 1. OpenSpec 文档

- [x] 1.1 创建本 change 的 proposal / design / tasks / spec artifacts（supersede prd-113 的拼装交互）。
- [x] 1.2 运行 `openspec validate "prd-114-sop-builder-dag-canvas"` 确认文档合法。

## 2. 依赖与数据模型

- [x] 2.1 在 `apps/web-console` 安装 `@xyflow/react`（v12.11.2），并在 `vite` 中确认可引入（`features/sop/components/SopCanvas.tsx` 已 `import "@xyflow/react/dist/style.css"`）。
- [x] 2.2 新增 SOP 领域类型（`SopNodeType / SopNode / SopEdge / SopDraft`），放置于 `features/sop/lib/`。
- [x] 2.3 新增 SOP 本地草稿 store（`listSopDrafts / createSopDraft / writeSopDrafts` + dev mock + `normalizeSopDraft`），镜像 agents 草稿模式。

## 3. 视图改造

- [x] 3.1 将侧边栏与 tab 的「Agent Builder」文案重命名为「SOP Builder」（图标 `Hammer` → `Workflow`）。
- [x] 3.2 用 `SopBuilderView` **替换** `BuilderView`（旧文件已删除）：默认渲染 SOP 列表页（卡片网格 + 顶部筛选工具条 + 右上「新建流程」），视觉对齐 Skill Hub / Agent 草稿。
- [x] 3.3 列表页卡片点击「编辑」或点「新建流程」→ 切换到画布编辑器视图。

## 4. DAG 画布（React Flow）

- [x] 4.1 画布左栏节点库：6 类节点可拖拽入画布（同时支持点击添加）。
- [x] 4.2 自定义节点组件：按类型着色、显示名称与关键标签（条件表达式 / model）。
- [x] 4.3 节点间连线：拖拽 handle 建边；选中边/节点后 `Backspace`/`Delete` 或右侧「删除」可删除。
- [x] 4.4 右侧节点配置面板：编辑名称、类型相关参数（AI 节点 model、条件节点表达式）、备注；连线分支标签可编辑。
- [x] 4.5 画布顶栏：流程名、描述、校验流程、缩放（React Flow Controls）、保存草稿、返回列表。
- [x] 4.6 修复连线箭头与 Handle 对齐：统一以 React Flow 锚点圆心计算路径，最终边和拖拽预览均展示方向箭头，并在画布呈现分支标签。
- [x] 4.7 收口画布工作区响应式布局：顶栏横跨画布与配置面板，窄窗口自动换行，避免操作按钮遮挡右侧配置区。
- [x] 4.8 优化节点智能吸附与对齐辅助线：12px 屏幕恒定阈值、拖动中即时吸附、每轴单一最佳辅助线、中心/边缘差异化样式与双轴锁定提示。

## 5. 流程校验

- [x] 5.1 实现 DAG 校验：单一起点、从起点可达、无悬挂节点、无环（acyclic）、至少含一个结束节点（警告）。
- [x] 5.2 校验结果在右侧「流程校验」区以通过（绿）/ 问题（琥珀/红）样式呈现。

## 6. 视觉与样式

- [x] 6.1 列表页与画布编辑器严格复用 Orbit 设计令牌，与 skill / agents 草稿页视觉一致（`orbit-studio.css` 增补 `.sop-*` 与 React Flow 暗色微调）。
- [x] 6.2 主色黑白色，彩色仅用于状态语义（节点类型区分、校验绿/琥珀）。

## 7. 验证与收口

- [x] 7.1 运行 `pnpm --filter agent-web-console build`（含 esbuild 转译）通过。
- [x] 7.2 运行 `tsc --noEmit`：新增 SOP 文件零类型错误（仓库既有 126 个 env 级 tsc 错误与本改动无关）。
- [x] 7.3 浏览器验证入口已就绪：dev server `http://127.0.0.1:5173/`；自测路径为列表 → 新建流程 → 拖节点 → 连线 → 配参数 → 校验 → 保存；校验失败分支（缺起点 / 悬挂节点 / 环）可在右侧直接看到。
- [x] 7.4 用户已验收并明确要求提交；完成测试/构建产物清理并提交本地 commit（不 push）。
