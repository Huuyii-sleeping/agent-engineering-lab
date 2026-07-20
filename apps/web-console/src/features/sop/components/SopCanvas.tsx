import { useCallback, useState, type DragEvent } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  ConnectionMode,
  type Connection,
  type Edge,
  type Node,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Upload,
  FileJson,
} from "lucide-react";
import { SopNodeView, type SopFlowData } from "./SopNodeView";
import { SopConnectionLine, SopEdge } from "./SopEdge";
import { SOP_TYPE_META, sopNodeCatalog } from "../lib/sop-catalog";
import { validateSop, type SopValidation } from "../lib/sop-validate";
import {
  getSopAlignmentSnap,
  type SopAlignmentGuide,
  type SopNodeBox,
  type SopNodeSize,
} from "../lib/sop-alignment";
import type { SopDraft, SopNodeType } from "../lib/sop-types";

const nodeTypes = { sop: SopNodeView };
const edgeTypes = { sop: SopEdge };

/** 所有边统一使用自定义 SopEdge（自带按状态着色的箭头 marker）。 */
const defaultEdgeOptions = {
  type: "sop" as const,
};

/* ------------------------------------------------------------------ */
/*  数据转换                                                          */
/* ------------------------------------------------------------------ */
function toFlowNodes(draft: SopDraft): Node<SopFlowData>[] {
  return draft.nodes.map((node) => ({
    id: node.id,
    type: "sop",
    position: node.position,
    data: {
      type: node.type,
      label: node.label,
      model: node.model,
      condition: node.condition,
      note: node.note,
    } satisfies SopFlowData,
  }));
}

function toFlowEdges(draft: SopDraft): Edge[] {
  return draft.edges.map((edge) => ({
    id: edge.id,
    type: "sop",
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    label: edge.label,
  }));
}

function buildDraft(id: string, name: string, summary: string, nodes: Node[], edges: Edge[]): SopDraft {
  return {
    id,
    name: name.trim() || "未命名流程",
    summary: summary.trim(),
    updatedAt: Date.now(),
    nodes: nodes.map((node) => {
      const data = node.data as SopFlowData;
      return {
        id: node.id,
        type: data.type,
        label: data.label,
        position: node.position,
        model: data.model,
        condition: data.condition,
        note: data.note,
      };
    }),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
      label: typeof edge.label === "string" && edge.label ? edge.label : undefined,
    })),
  };
}

/* ------------------------------------------------------------------ */
/*  主画布                                                            */
/* ------------------------------------------------------------------ */

function SopCanvasInner({
  initial,
  onSave,
  onBack,
}: {
  initial: SopDraft;
  onSave: (draft: SopDraft) => void;
  onBack: () => void;
}) {
  const { screenToFlowPosition, getViewport } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(initial));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(initial));

  const [name, setName] = useState(initial.name);
  const [summary, setSummary] = useState(initial.summary);

  /* ---- 多选状态（替代单选 selectedNodeId / selectedEdgeId）---- */
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(new Set());

  /* ---- JSON 面板状态 ---- */
  const [showJsonPanel, setShowJsonPanel] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const [validation, setValidation] = useState<SopValidation | null>(null);

  /* 对齐辅助线状态 */
  const [alignLines, setAlignLines] = useState<SopAlignmentGuide[]>([]);

  const selectedNode = selectedNodeIds.size === 1
    ? nodes.find((n) => n.id === Array.from(selectedNodeIds)[0]) ?? null
    : null;
  const selectedEdge = selectedEdgeIds.size === 1
    ? edges.find((e) => e.id === Array.from(selectedEdgeIds)[0]) ?? null
    : null;
  /** 单选一个节点时的 ID（兼容 inspector） */
  const singleSelectedNodeId = selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null;
  const singleSelectedEdgeId = selectedEdgeIds.size === 1 ? Array.from(selectedEdgeIds)[0] : null;

  /* ---- 选中变化（多选） ---- */
  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      setSelectedNodeIds(new Set(selectedNodes.map((n) => n.id)));
      setSelectedEdgeIds(new Set(selectedEdges.map((e) => e.id)));
    },
    [],
  );

  /* ---- 连线回调 ---- */
  const onConnect = useCallback(
    (conn: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...conn,
            id: `e-${Date.now().toString(36)}`,
            type: "sop",
          },
          eds,
        ),
      );
      setValidation(null);
    },
    [setEdges],
  );

  /* ---- 拖放节点 ---- */
  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const addNodeOfType = useCallback(
    (type: SopNodeType, position?: { x: number; y: number }) => {
      const meta = SOP_TYPE_META[type];
      const id = `n-${Date.now().toString(36)}`;
      const pos =
        position ??
        { x: 240 + (nodes.length % 4) * 40, y: 80 + (nodes.length % 6) * 36 };
      const data: SopFlowData = {
        type,
        label: meta.label,
        ...(type === "ai" ? { model: "gpt-4o", temperature: 0.7 } : {}),
        ...(type === "condition" ? { condition: "value > 0" } : {}),
        ...(type === "process" ? { steps: "步骤描述..." } : {}),
        ...(type === "tool" ? { toolName: "", params: "" } : {}),
      };
      setNodes((nds) => [...nds, { id, type: "sop", position: pos, data }]);
      setValidation(null);
    },
    [nodes.length, setNodes],
  );

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/sop-node") as SopNodeType;
      if (!type || !SOP_TYPE_META[type]) return;
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      addNodeOfType(type, position);
    },
    [screenToFlowPosition, addNodeOfType],
  );

  /* ---- 对齐辅助线拖拽 ---- */
  const handleNodeDrag: OnNodeDrag = useCallback(
    (_event, node, draggedNodes) => {
      if (draggedNodes.length > 1) {
        setAlignLines([]);
        return;
      }
      const vp = getViewport();
      const draggedSize: SopNodeSize = {
        w: node.measured?.width ?? 168,
        h: node.measured?.height ?? 80,
      };
      const others: SopNodeBox[] = nodes
        .filter((n) => n.id !== node.id)
        .map((n) => ({
          id: n.id,
          position: n.position,
          size: { w: n.measured?.width ?? 168, h: n.measured?.height ?? 80 },
        }));
      const snap = getSopAlignmentSnap(node.position, draggedSize, others, vp);
      setAlignLines(snap.guides);
      if (snap.dx !== 0 || snap.dy !== 0) {
        const snappedPosition = {
          x: node.position.x + snap.dx / vp.zoom,
          y: node.position.y + snap.dy / vp.zoom,
        };
        setNodes((current) =>
          current.map((item) =>
            item.id === node.id ? { ...item, position: snappedPosition } : item,
          ),
        );
      }
    },
    [nodes, getViewport, setNodes],
  );

  /* ---- 拖拽结束：再次以相同规则收口最终坐标 ---- */
  const handleNodeDragStop: OnNodeDrag = useCallback(
    (_event, node, draggedNodes) => {
      if (draggedNodes.length > 1) {
        setAlignLines([]);
        return;
      }
      const vp = getViewport();
      const draggedSize: SopNodeSize = {
        w: node.measured?.width ?? 168,
        h: node.measured?.height ?? 80,
      };
      const others: SopNodeBox[] = nodes
        .filter((n) => n.id !== node.id)
        .map((n) => ({
          id: n.id,
          position: n.position,
          size: { w: n.measured?.width ?? 168, h: n.measured?.height ?? 80 },
        }));
      const snap = getSopAlignmentSnap(node.position, draggedSize, others, vp);
      if (snap.dx !== 0 || snap.dy !== 0) {
        const snappedPos = {
          x: node.position.x + snap.dx / vp.zoom,
          y: node.position.y + snap.dy / vp.zoom,
        };
        setNodes((nds) =>
          nds.map((n) => (n.id === node.id ? { ...n, position: snappedPos } : n)),
        );
      }
      setAlignLines([]);
    },
    [nodes, getViewport, setNodes],
  );

  /* ---- 更新选中节点/边 ---- */
  const updateSelectedNode = useCallback(
    (patch: Partial<SopFlowData>) => {
      if (!singleSelectedNodeId) return;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === singleSelectedNodeId
            ? { ...n, data: { ...(n.data as SopFlowData), ...patch } }
            : n,
        ),
      );
      setValidation(null);
    },
    [singleSelectedNodeId, setNodes],
  );

  const updateSelectedEdgeLabel = useCallback(
    (label: string) => {
      if (!singleSelectedEdgeId) return;
      setEdges((eds) =>
        eds.map((e) => (e.id === singleSelectedEdgeId ? { ...e, label } : e)),
      );
      setValidation(null);
    },
    [singleSelectedEdgeId, setEdges],
  );

  const deleteSelected = useCallback(() => {
    if (selectedNodeIds.size > 0)
      setNodes((nds) => nds.filter((n) => !selectedNodeIds.has(n.id)));
    if (selectedEdgeIds.size > 0)
      setEdges((eds) => eds.filter((e) => !selectedEdgeIds.has(e.id)));
    setSelectedNodeIds(new Set());
    setSelectedEdgeIds(new Set());
    setValidation(null);
  }, [selectedNodeIds, selectedEdgeIds, setNodes, setEdges]);

  const duplicateSelected = useCallback(() => {
    // 复制所有选中节点
    const toDuplicate = nodes.filter((n) => selectedNodeIds.has(n.id));
    if (toDuplicate.length === 0) return;
    const now = Date.now().toString(36);
    const newNodes = toDuplicate.map((n, i) => {
      const d = n.data as SopFlowData;
      return {
        id: `n-${now}-${i}`,
        type: "sop" as const,
        position: { x: n.position.x + 30, y: n.position.y + 30 },
        data: { ...d, label: `${d.label} (副本)` } as SopFlowData,
      };
    });
    setNodes((nds) => [...nds, ...newNodes]);
  }, [nodes, selectedNodeIds, setNodes]);

  /* ---- JSON 导出 / 导入 ---- */

  /** 将当前画布导出为格式化 JSON（干净结构，不含内部 id 前缀噪声） */
  const handleExportJson = useCallback(() => {
    const draft = buildDraft(initial.id, name, summary, nodes, edges);
    const json = JSON.stringify(draft, null, 2);
    setJsonText(json);
    setJsonError(null);
    setShowJsonPanel(true);
  }, [initial.id, name, summary, nodes, edges]);

  /** 下载 JSON 为文件 */
  const handleDownloadJson = useCallback(() => {
    const draft = buildDraft(initial.id, name, summary, nodes, edges);
    const json = JSON.stringify(draft, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/\s+/g, "_") || "sop"}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [initial.id, name, summary, nodes, edges]);

  /** 从 JSON 文本导入（校验后加载到画布） */
  const handleImportJson = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText) as Partial<SopDraft>;
      // 基本校验
      if (!parsed.name || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        setJsonError("JSON 结构无效：需要 name / nodes / edges 字段");
        return;
      }
      // 加载数据
      setName(parsed.name);
      setSummary(parsed.summary ?? "");
      setNodes(toFlowNodes(parsed as SopDraft));
      setEdges(toFlowEdges(parsed as SopDraft));
      setJsonError(null);
      setShowJsonPanel(false);
      setValidation(null);
    } catch (e) {
      setJsonError(`JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [jsonText, setNodes, setEdges]);

  /* ---- 校验 & 保存 ---- */
  const handleValidate = useCallback(() => {
    setValidation(validateSop(buildDraft(initial.id, name, summary, nodes, edges)));
  }, [initial.id, name, summary, nodes, edges]);

  const handleSave = useCallback(() => {
    onSave(buildDraft(initial.id, name, summary, nodes, edges));
  }, [initial.id, name, summary, nodes, edges, onSave]);

  const nodeData = selectedNode?.data as SopFlowData | undefined;
  const verticalAlignLine = alignLines.find((line) => line.axis === "x");
  const horizontalAlignLine = alignLines.find((line) => line.axis === "y");

  /* ---- 顶部工具栏按钮（JSON 导入/导出）---- */

  /* ---- 渲染 ---- */
  return (
    <div className="sop-wrap">
      {/* 左侧节点库 */}
      <aside className="sop-pal">
        <div className="sop-pal-h">节点库</div>
        <div className="sop-pal-hint">拖入画布，或点击添加</div>
        {sopNodeCatalog.map((meta) => {
          const Icon = meta.icon;
          return (
            <div
              key={meta.type}
              className="sop-pal-item"
              draggable
              style={{ borderColor: `${meta.color}55` }}
              onDragStart={(event) => {
                event.dataTransfer.setData("application/sop-node", meta.type);
                event.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => addNodeOfType(meta.type)}
            >
              <span className="sop-pal-ic" style={{ color: meta.color }}>
                <Icon width={16} height={16} aria-hidden="true" />
              </span>
              <div>
                <div className="sop-pal-nm">{meta.label}</div>
                <div className="sop-pal-ds">{meta.desc}</div>
              </div>
            </div>
          );
        })}
      </aside>

      {/* 画布工作区：顶栏横跨画布与配置面板，窄窗口不会互相遮挡。 */}
      <div className="sop-workspace">
        {/* 顶栏 */}
        <div className="sop-top">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
            <ArrowLeft aria-hidden="true" /> 返回列表
          </button>
          <input
            className="sop-name"
            value={name}
            placeholder="流程名称"
            onChange={(event) => setName(event.target.value)}
          />
          <input
            className="sop-sum"
            value={summary}
            placeholder="一句话描述"
            onChange={(event) => setSummary(event.target.value)}
          />
          <div className="sop-top-sp" />
          <div className="sop-top-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleValidate}>
              <TriangleAlert aria-hidden="true" /> 校验流程
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSave}>
              <Check aria-hidden="true" /> 保存草稿
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleExportJson} title="导出 JSON">
              <FileJson width={14} height={14} aria-hidden="true" /> JSON
            </button>
            <label className="btn btn-ghost btn-sm sop-json-upload" title="导入 JSON 文件">
              <Upload width={14} height={14} aria-hidden="true" /> 导入
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const text = ev.target?.result as string;
                    setJsonText(text);
                    setShowJsonPanel(true);
                    setJsonError(null);
                  };
                  reader.readAsText(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>

        <div className="sop-workspace-body">
          <div className="sop-main">
            {/* React Flow 画布区域 */}
            <div className="sop-canvas" onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            connectionMode={ConnectionMode.Loose}
            edgeTypes={edgeTypes}
            onNodeClick={(_, node) => {
              // 单击节点 → 选中该节点（Shift 保持多选由 React Flow 内部处理）
              setSelectedNodeIds(new Set([node.id]));
              setSelectedEdgeIds(new Set());
            }}
            onEdgeClick={(_, edge) => {
              setSelectedEdgeIds(new Set([edge.id]));
              setSelectedNodeIds(new Set());
            }}
            onPaneClick={() => {
              setSelectedNodeIds(new Set());
              setSelectedEdgeIds(new Set());
            }}
            onSelectionChange={handleSelectionChange}
            multiSelectionKeyCode="Shift"
            selectionOnDrag
            panOnDrag={[1, 2]} /* 中键/右键平移；左键=框选或拖节点 */
            nodesSelectable
            elementsSelectable
            onNodeDrag={handleNodeDrag}
            onNodeDragStop={handleNodeDragStop}
            deleteKeyCode={["Backspace", "Delete"]}
            fitView
            defaultEdgeOptions={defaultEdgeOptions}
            connectionRadius={40}
            connectionLineType="smoothstep"
            connectionLineComponent={SopConnectionLine}
            connectionLineStyle={{
              stroke: "#22c55e",
              strokeWidth: 2.2,
              strokeDasharray: "6 4",
            }}
            proOptions={{ hideAttribution: true }}
          >
            {/* 网格背景（Lines 变体，暗色可见） */}
            <Background
              variant={BackgroundVariant.Lines}
              gap={24}
              size={1}
              color="rgba(255,255,255,0.07)"
            />

            {/* 缩放控件 */}
            <Controls showInteractive={false} />

            {/* 小地图 */}
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) =>
                SOP_TYPE_META[(n.data as SopFlowData).type]?.color ?? "#888"
              }
              maskColor="rgba(0,0,0,0.35)"
            />

            {/* 对齐辅助线 SVG 覆盖层 */}
            {alignLines.length > 0 && (
              <svg
                className="sop-align-svg"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                  zIndex: 10,
                  overflow: "visible",
                }}
              >
                {alignLines.map((line) =>
                  line.axis === "x" ? (
                    <line
                      key="align-x"
                      className={`sop-align-line ${line.kind}`}
                      x1={line.value}
                      y1={line.start}
                      x2={line.value}
                      y2={line.end}
                    />
                  ) : (
                    <line
                      key="align-y"
                      className={`sop-align-line ${line.kind}`}
                      x1={line.start}
                      y1={line.value}
                      x2={line.end}
                      y2={line.value}
                    />
                  ),
                )}
                {verticalAlignLine && horizontalAlignLine ? (
                  <circle
                    className="sop-align-lock"
                    cx={verticalAlignLine.value}
                    cy={horizontalAlignLine.value}
                    r={3.5}
                  />
                ) : null}
              </svg>
            )}
              </ReactFlow>
            </div>
          </div>

          {/* 右侧配置面板 */}
          <aside className="sop-insp">
        {showJsonPanel ? (
          /* ====== JSON 编辑面板 ====== */
          <div className="sop-insp-in">
            <div className="sop-insp-h">
              <FileJson width={14} height={14} aria-hidden="true" />
              JSON 编辑器
              <button
                type="button"
                className="btn btn-ghost btn-sm sop-json-close"
                onClick={() => setShowJsonPanel(false)}
                title="关闭"
              >
                ✕
              </button>
            </div>
            <div className="sop-json-desc">
              导入 SOP 流程定义（JSON 格式），或查看当前画布导出结果。
            </div>
            <textarea
              className="sop-json-editor"
              rows={16}
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setJsonError(null);
              }}
              placeholder='{"name":"我的流程","nodes":[...],"edges":[...]}' spellCheck={false}
            />
            {jsonError && <div className="sop-valid-item err">{jsonError}</div>}
            <div className="sop-action-row" style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleImportJson}>
                <Upload width={13} height={13} aria-hidden="true" /> 导入到画布
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleDownloadJson}>
                <Download width={13} height={13} aria-hidden="true" /> 下载文件
              </button>
            </div>
          </div>
        ) : selectedNodeIds.size > 1 ? (
          /* ====== 多选节点状态 ====== */
          <div className="sop-insp-in">
            <div className="sop-insp-h">
              <span className="dot" style={{ background: "#94a3b8" }} />
              批量操作
            </div>
            <div className="sop-info-row">
              <span className="sop-info-label">已选节点</span>
              <span className="sop-info-val">{selectedNodeIds.size} 个</span>
            </div>
            <div className="sop-action-row">
              <button type="button" className="btn btn-ghost btn-sm" onClick={duplicateSelected}>
                <Copy width={13} height={13} aria-hidden="true" /> 复制全部
              </button>
              <button type="button" className="btn btn-ghost btn-sm sop-del" onClick={deleteSelected}>
                <Trash2 width={13} height={13} aria-hidden="true" /> 删除全部
              </button>
            </div>
          </div>
        ) : selectedNode ? (
          <SopNodeInspector
            nodeData={nodeData!}
            nodeId={selectedNode.id}
            nodeType={nodeData!.type}
            onUpdate={updateSelectedNode}
            onDelete={deleteSelected}
            onDuplicate={duplicateSelected}
          />
        ) : selectedEdge ? (
          <div className="sop-insp-in">
            <div className="sop-insp-h">
              <span className="dot" style={{ background: "#94a3b8" }} />
              连线配置
            </div>
            <label className="sop-field">
              <span>分支标签</span>
              <input
                value={typeof selectedEdge.label === "string" ? selectedEdge.label : ""}
                placeholder="是 / 否 / 默认"
                onChange={(e) => updateSelectedEdgeLabel(e.target.value)}
              />
            </label>
            <label className="sop-field">
              <span>起点</span>
              <input disabled value={selectedEdge.source} />
            </label>
            <label className="sop-field">
              <span>终点</span>
              <input disabled value={selectedEdge.target} />
            </label>
            <button type="button" className="btn btn-ghost btn-sm sop-del" onClick={deleteSelected}>
              <Trash2 aria-hidden="true" /> 删除连线
            </button>
          </div>
        ) : (
          <div className="sop-insp-in">
            <div className="sop-insp-h">流程校验</div>
            {validation ? (
              <div className="sop-valid">
                {validation.errors.length === 0 ? (
                  <div className="sop-valid-ok">
                    <Check width={14} height={14} aria-hidden="true" /> 校验通过
                  </div>
                ) : (
                  <div className="sop-valid-err">
                    <TriangleAlert width={14} height={14} aria-hidden="true" />{" "}
                    {validation.errors.length} 个问题
                  </div>
                )}
                {validation.errors.map((msg, i) => (
                  <div key={`e${i}`} className="sop-valid-item err">
                    {msg}
                  </div>
                ))}
                {validation.warnings.map((msg, i) => (
                  <div key={`w${i}`} className="sop-valid-item warn">
                    {msg}
                  </div>
                ))}
              </div>
            ) : (
              <div className="sop-insp-empty">
                点击「校验流程」检查 DAG 是否合法；<br />
                选中节点或连线可在此编辑。
              </div>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm sop-del"
              onClick={() => setValidation(null)}
            >
              <RotateCcw aria-hidden="true" /> 清除校验
            </button>
          </div>
        )}
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  右侧节点详细配置面板                                                */
/* ------------------------------------------------------------------ */

function SopNodeInspector({
  nodeData,
  nodeId,
  nodeType,
  onUpdate,
  onDelete,
  onDuplicate,
}: {
  nodeData: SopFlowData;
  nodeId: string;
  nodeType: SopNodeType;
  onUpdate: (patch: Partial<SopFlowData>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const meta = SOP_TYPE_META[nodeType];

  return (
    <div className="sop-insp-in">
      {/* 标题栏 */}
      <div className="sop-insp-h">
        <span className="dot" style={{ background: meta.color }} />
        节点配置
      </div>

      {/* 只读信息 */}
      <div className="sop-info-row">
        <span className="sop-info-label">类型</span>
        <span className="sop-info-val" style={{ color: meta.color }}>
          {meta.label}
        </span>
      </div>
      <div className="sop-info-row">
        <span className="sop-info-label">ID</span>
        <span className="sop-info-val sop-info-mono">{nodeId}</span>
      </div>

      {/* 分隔线 */}
      <div className="sop-sep" />

      {/* 通用字段：名称 */}
      <label className="sop-field">
        <span>名称</span>
        <input
          value={nodeData.label ?? ""}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="节点显示名"
        />
      </label>

      {/* 通用字段：备注 */}
      <label className="sop-field">
        <span>备注</span>
        <textarea
          rows={3}
          value={nodeData.note ?? ""}
          onChange={(e) => onUpdate({ note: e.target.value })}
          placeholder="可选备注..."
        />
      </label>

      {/* ====== 按节点类型展示不同配置 ====== */}

      {/* AI 节点专属 */}
      {nodeType === "ai" && (
        <>
          <div className="sop-sep" />
          <div className="sop-field-group-title">AI 参数</div>
          <label className="sop-field">
            <span>模型</span>
            <select
              value={nodeData.model ?? ""}
              onChange={(e) => onUpdate({ model: e.target.value })}
            >
              <option value="">选择模型…</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4o-mini">GPT-4o mini</option>
              <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
              <option value="claude-opus-4">Claude Opus 4</option>
              <option value="deepseek-chat">DeepSeek Chat</option>
              <option value="custom">自定义模型…</option>
            </select>
          </label>
          {(nodeData.model === "custom" || ![
            "gpt-4o","gpt-4o-mini","claude-sonnet-4-20250514","claude-opus-4","deepseek-chat",
          ].includes(nodeData.model ?? "")) && (
            <label className="sop-field">
              <span>自定义模型 ID</span>
              <input
                value={nodeData.model ?? ""}
                placeholder="my-custom-model-v1"
                onChange={(e) => onUpdate({ model: e.target.value })}
              />
            </label>
          )}
          <label className="sop-field">
            <span>Temperature</span>
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={(nodeData as any).temperature ?? 0.7}
              onChange={(e) =>
                onUpdate({ temperature: parseFloat(e.target.value) || 0 })
              }
            />
          </label>
          <label className="sop-field">
            <span>System Prompt</span>
            <textarea
              rows={3}
              placeholder="你是一个有用的助手…"
              value={(nodeData as any).systemPrompt ?? ""}
              onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
            />
          </label>
        </>
      )}

      {/* 条件节点专属 */}
      {nodeType === "condition" && (
        <>
          <div className="sop-sep" />
          <div className="sop-field-group-title">条件参数</div>
          <label className="sop-field">
            <span>表达式</span>
            <input
              value={nodeData.condition ?? ""}
              placeholder="score >= 60"
              onChange={(e) => onUpdate({ condition: e.target.value })}
            />
          </label>
          <label className="sop-field">
            <span>阈值（数字）</span>
            <input
              type="number"
              step={0.01}
              value={(nodeData as any).threshold ?? ""}
              placeholder="60"
              onChange={(e) => onUpdate({ threshold: parseFloat(e.target.value) || undefined })}
            />
          </label>
          <label className="sop-field">
            <span>比较运算符</span>
            <select
              value={(nodeData as any).operator ?? ">="}
              onChange={(e) => onUpdate({ operator: e.target.value })}
            >
              <option value=">=">&gt;= （大于等于）</option>
              <option value="&lt;=">&lt;= （小于等于）</option>
              <option value="==">== （等于）</option>
              <option value="!=">!= （不等于）</option>
              <option value=">">&gt; （大于）</option>
              <option value="<">&lt; （小于）</option>
            </select>
          </label>
          <label className="sop-field">
            <span>变量来源</span>
            <input
              value={(nodeData as any).variable ?? ""}
              placeholder="如 output.score、context.status"
              onChange={(e) => onUpdate({ variable: e.target.value })}
            />
          </label>
        </>
      )}

      {/* 处理节点专属 */}
      {nodeType === "process" && (
        <>
          <div className="sop-sep" />
          <div className="sop-field-group-title">处理逻辑</div>
          <label className="sop-field">
            <span>步骤描述</span>
            <textarea
              rows={4}
              placeholder={"# 步骤 1\n# 步骤 2\n# …"}
              value={(nodeData as any).steps ?? ""}
              onChange={(e) => onUpdate({ steps: e.target.value })}
            />
          </label>
          <label className="sop-field">
            <span>超时 (ms)</span>
            <input
              type="number"
              min={1000}
              step={1000}
              value={(nodeData as any).timeoutMs ?? 30000}
              onChange={(e) => onUpdate({ timeoutMs: parseInt(e.target.value, 10) || undefined })}
            />
          </label>
          <label className="sop-field">
            <span>重试次数</span>
            <input
              type="number"
              min={0}
              max={10}
              value={(nodeData as any).retries ?? 0}
              onChange={(e) => onUpdate({ retries: parseInt(e.target.value, 10) || 0 })}
            />
          </label>
        </>
      )}

      {/* 工具调用节点专属 */}
      {nodeType === "tool" && (
        <>
          <div className="sop-sep" />
          <div className="sop-field-group-title">工具配置</div>
          <label className="sop-field">
            <span>工具名称</span>
            <input
              value={(nodeData as any).toolName ?? ""}
              placeholder="web_search / code_runner"
              onChange={(e) => onUpdate({ toolName: e.target.value })}
            />
          </label>
          <label className="sop-field">
            <span>参数 (JSON)</span>
            <textarea
              rows={3}
              placeholder='{"query":"..."}'
              value={(nodeData as any).params ?? ""}
              onChange={(e) => onUpdate({ params: e.target.value })}
            />
          </label>
        </>
      )}

      {/* 开始节点专属 */}
      {nodeType === "start" && (
        <>
          <div className="sop-sep" />
          <div className="sop-field-group-title">触发器</div>
          <label className="sop-field">
            <span>触发方式</span>
            <select
              value={(nodeData as any).trigger ?? "manual"}
              onChange={(e) => onUpdate({ trigger: e.target.value })}
            >
              <option value="manual">手动触发</option>
              <option value="webhook">Webhook</option>
              <option value="schedule">定时调度</option>
              <option value="event">事件驱动</option>
            </select>
          </label>
          {(nodeData as any).trigger === "webhook" && (
            <label className="sop-field">
              <span>Webhook Path</span>
              <input
                value={(nodeData as any).webhookPath ?? "/webhook/start"}
                onChange={(e) => onUpdate({ webhookPath: e.target.value })}
              />
            </label>
          )}
          {(nodeData as any).trigger === "schedule" && (
            <label className="sop-field">
              <span>Cron 表达式</span>
              <input
                value={(nodeData as any).cronExpr ?? "0 * * * *"}
                placeholder="0 * * * *"
                onChange={(e) => onUpdate({ cronExpr: e.target.value })}
              />
            </label>
          )}
        </>
      )}

      {/* 结束节点专属 */}
      {nodeType === "end" && (
        <>
          <div className="sop-sep" />
          <div className="sop-field-group-title">输出</div>
          <label className="sop-field">
            <span>输出模式</span>
            <select
              value={(nodeData as any).outputMode ?? "result"}
              onChange={(e) => onUpdate({ outputMode: e.target.value })}
            >
              <option value="result">返回结果</option>
              <option value="notify">发送通知</option>
              <option value="callback">回调 URL</option>
              <option value="store">存储到变量</option>
            </select>
          </label>
          {[(nodeData as any).outputMode].includes("callback") && (
            <label className="sop-field">
              <span>回调地址</span>
              <input
                value={(nodeData as any).callbackUrl ?? ""}
                placeholder="https://api.example.com/callback"
                onChange={(e) => onUpdate({ callbackUrl: e.target.value })}
              />
            </label>
          )}
          {[(nodeData as any).outputMode].includes("notify") && (
            <label className="sop-field">
              <span>通知渠道</span>
              <input
                value={(nodeData as any).notifyChannel ?? ""}
                placeholder="email / webhook / slack"
                onChange={(e) => onUpdate({ notifyChannel: e.target.value })}
              />
            </label>
          )}
        </>
      )}

      {/* 操作按钮区 */}
      <div className="sop-sep" />
      <div className="sop-action-row">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDuplicate}>
          <Copy width={13} height={13} aria-hidden="true" /> 复制
        </button>
        <button type="button" className="btn btn-ghost btn-sm sop-del" onClick={onDelete}>
          <Trash2 width={13} height={13} aria-hidden="true" /> 删除
        </button>
      </div>
    </div>
  );
}

/** SOP 编排画布（受 ReactFlowProvider 包裹以支持坐标换算）。 */
export function SopCanvas(props: {
  initial: SopDraft;
  onSave: (draft: SopDraft) => void;
  onBack: () => void;
}) {
  return (
    <ReactFlowProvider>
      <SopCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
