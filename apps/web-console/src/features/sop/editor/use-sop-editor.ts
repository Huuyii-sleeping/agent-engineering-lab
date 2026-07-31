import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { addEdge, applyEdgeChanges, applyNodeChanges, useReactFlow, type Connection, type Edge, type Node, type OnEdgesChange, type OnNodeDrag, type OnNodesChange } from "@xyflow/react";
import { WORKFLOW_SCHEMA_VERSION, builtinNodeRegistry, getAvailableVariables, migrateSopDraftV1, refreshNodePorts, type AvailableVariable, type BuiltinNodeType, type WorkflowDraft, type WorkflowNode, type WorkflowRuntimeEvent } from "@orbit/workflow-core";
import { getSopAlignmentSnap, type SopAlignmentGuide, type SopNodeBox, type SopNodeSize } from "../lib/sop-alignment";
import { validateSop, type SopValidation } from "../lib/sop-validate";
import { parseWorkflowDraftJson, toFlowGraphEdges, toFlowGraphNodes, toWorkflowGraph, type SopFlowData, type SopFlowEdgeData } from "./sop-flow-adapter";
import { cloneSelectedGraph } from "./sop-selection";
import { pasteSelection, serializeSelection } from "./sop-clipboard";
import { pushHistory, redoHistory, undoHistory, type EditorHistory } from "./sop-history";
import { layoutFlowGraph } from "./sop-layout";
import { reconcileFlowEdges, validateFlowConnection } from "./sop-connections";
import {
  enterSopContainer,
  getSopGraphAtPath,
  getSopScopeCrumbs,
  getSopScopeKey,
  getSopSubgraphVariablesAtPath,
  updateSopGraphAtPath,
  type SopContainerPath,
} from "./sop-subgraph-adapter";
import { centerViewportAfterResize, type SopCanvasSize } from "./sop-viewport";

type DebugState = { status: "idle" | "validating" | "ready" | "error"; message?: string };
type ScopeSelection = { nodeIds: string[]; edgeIds: string[] };
type ScopeSelections = Record<string, ScopeSelection>;
type EditorDocumentSnapshot = {
  draft: WorkflowDraft;
  scopePath: string[];
  selections: ScopeSelections;
  collapsedNodeKeys: string[];
  pinnedNodeKeys: string[];
};

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const scopeNodeKey = (path: SopContainerPath, nodeId: string) => `${getSopScopeKey(path)}#${encodeURIComponent(nodeId)}`;
const mergeEdgeData = (edge: Edge<SopFlowEdgeData>, update: Partial<SopFlowEdgeData>): SopFlowEdgeData => ({
  status: edge.data?.status ?? "valid",
  ...edge.data,
  ...update,
});
const runtimeVariables: AvailableVariable[] = [
  { id: "system:runId", label: "运行 ID", group: "系统", dataType: "string", ref: { scope: "system", key: "runId" } },
  { id: "system:currentTime", label: "当前时间", group: "系统", dataType: "string", ref: { scope: "system", key: "currentTime" } },
  { id: "environment:ORBIT_ENV", label: "运行环境", group: "环境", dataType: "string", ref: { scope: "environment", key: "ORBIT_ENV" } },
];

function createScopeFlow(
  draft: WorkflowDraft,
  path: SopContainerPath,
  selections: ScopeSelections,
  collapsedNodeKeys: ReadonlySet<string>,
  pinnedNodeKeys: ReadonlySet<string>,
) {
  const graph = getSopGraphAtPath(draft, path);
  const selection = selections[getSopScopeKey(path)] ?? { nodeIds: [], edgeIds: [] };
  const selectedNodes = new Set(selection.nodeIds);
  const selectedEdges = new Set(selection.edgeIds);
  return {
    nodes: toFlowGraphNodes(graph.nodes).map((node) => ({
      ...node,
      selected: selectedNodes.has(node.id),
      draggable: pinnedNodeKeys.has(scopeNodeKey(path, node.id)) ? false : undefined,
      data: { ...node.data, collapsed: collapsedNodeKeys.has(scopeNodeKey(path, node.id)) },
    })),
    edges: toFlowGraphEdges(graph.edges).map((edge) => ({ ...edge, selected: selectedEdges.has(edge.id) })),
    selectedNodeIds: selectedNodes,
    selectedEdgeIds: selectedEdges,
  };
}

/** 集中管理 SOP 编辑器的根草稿、容器作用域、图适配、历史、选择、视口、校验和调试状态。 */
export function useSopEditor(initial: WorkflowDraft) {
  const flow = useReactFlow<Node<SopFlowData>, Edge<SopFlowEdgeData>>();
  const [draftState, setDraftState] = useState(initial);
  const [scopePath, setScopePath] = useState<string[]>([]);
  const [scopeSelections, setScopeSelections] = useState<ScopeSelections>({});
  const [collapsedNodeKeys, setCollapsedNodeKeys] = useState<Set<string>>(new Set());
  const [pinnedNodeKeys, setPinnedNodeKeys] = useState<Set<string>>(new Set());
  const [nodes, setNodes] = useState<Node<SopFlowData>[]>(() => toFlowGraphNodes(initial.nodes));
  const [edges, setEdges] = useState<Edge<SopFlowEdgeData>[]>(() => toFlowGraphEdges(initial.edges));
  const [name, setNameState] = useState(initial.name);
  const [summary, setSummaryState] = useState(initial.summary);
  const [selectedNodeIds, setSelectedNodeIdsState] = useState<Set<string>>(new Set());
  const [selectedEdgeIds, setSelectedEdgeIdsState] = useState<Set<string>>(new Set());
  const [validation, setValidation] = useState<SopValidation | null>(null);
  const [alignLines, setAlignLines] = useState<SopAlignmentGuide[]>([]);
  const [showJsonPanel, setShowJsonPanel] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [dirtyRevision, setDirtyRevision] = useState(0);
  const [debugState, setDebugState] = useState<DebugState>({ status: "idle" });
  const [connectionHint, setConnectionHint] = useState<string | null>(null);
  const [history, setHistory] = useState<EditorHistory<EditorDocumentSnapshot>>({ past: [], future: [] });
  const [clipboardText, setClipboardText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const scopeKey = getSopScopeKey(scopePath);

  const markDirty = useCallback(() => {
    setDirtyRevision((revision) => revision + 1);
    setValidation(null);
    setDebugState({ status: "idle" });
  }, []);
  const setName = useCallback((value: string) => { setNameState(value); markDirty(); }, [markDirty]);
  const setSummary = useCallback((value: string) => { setSummaryState(value); markDirty(); }, [markDirty]);
  const setSelectedNodeIds = useCallback((ids: Set<string>) => {
    setSelectedNodeIdsState(ids);
    setScopeSelections((current) => ({
      ...current,
      [scopeKey]: { nodeIds: [...ids], edgeIds: current[scopeKey]?.edgeIds ?? [...selectedEdgeIds] },
    }));
  }, [scopeKey, selectedEdgeIds]);
  const setSelectedEdgeIds = useCallback((ids: Set<string>) => {
    setSelectedEdgeIdsState(ids);
    setScopeSelections((current) => ({
      ...current,
      [scopeKey]: { nodeIds: current[scopeKey]?.nodeIds ?? [...selectedNodeIds], edgeIds: [...ids] },
    }));
  }, [scopeKey, selectedNodeIds]);

  const persistActiveScope = useCallback(() => updateSopGraphAtPath(draftState, scopePath, toWorkflowGraph(nodes, edges)), [draftState, edges, nodes, scopePath]);
  const currentDraft = useCallback(() => {
    const draft = persistActiveScope();
    return {
      ...draft,
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      name: name.trim() || "未命名流程",
      summary: summary.trim(),
      revision: draft.revision + 1,
      updatedAt: Date.now(),
    };
  }, [name, persistActiveScope, summary]);
  const captureSnapshot = useCallback((): EditorDocumentSnapshot => ({
    draft: { ...persistActiveScope(), name, summary },
    scopePath: [...scopePath],
    selections: {
      ...scopeSelections,
      [scopeKey]: { nodeIds: [...selectedNodeIds], edgeIds: [...selectedEdgeIds] },
    },
    collapsedNodeKeys: [...collapsedNodeKeys],
    pinnedNodeKeys: [...pinnedNodeKeys],
  }), [collapsedNodeKeys, name, persistActiveScope, pinnedNodeKeys, scopeKey, scopePath, scopeSelections, selectedEdgeIds, selectedNodeIds, summary]);
  const recordHistory = useCallback(() => setHistory((current) => pushHistory(current, captureSnapshot())), [captureSnapshot]);

  const restoreSnapshot = useCallback((snapshot: EditorDocumentSnapshot) => {
    const collapsed = new Set(snapshot.collapsedNodeKeys);
    const pinned = new Set(snapshot.pinnedNodeKeys);
    const active = createScopeFlow(snapshot.draft, snapshot.scopePath, snapshot.selections, collapsed, pinned);
    setDraftState(snapshot.draft);
    setNameState(snapshot.draft.name);
    setSummaryState(snapshot.draft.summary);
    setScopePath(snapshot.scopePath);
    setScopeSelections(snapshot.selections);
    setCollapsedNodeKeys(collapsed);
    setPinnedNodeKeys(pinned);
    setNodes(active.nodes);
    setEdges(active.edges);
    setSelectedNodeIdsState(active.selectedNodeIds);
    setSelectedEdgeIdsState(active.selectedEdgeIds);
    setAlignLines([]);
    setConnectionHint(null);
  }, []);

  const navigateToScope = useCallback((nextPath: SopContainerPath) => {
    const snapshot = captureSnapshot();
    const active = createScopeFlow(snapshot.draft, nextPath, snapshot.selections, new Set(snapshot.collapsedNodeKeys), new Set(snapshot.pinnedNodeKeys));
    setHistory((current) => pushHistory(current, snapshot));
    setDraftState(snapshot.draft);
    setScopePath([...nextPath]);
    setNodes(active.nodes);
    setEdges(active.edges);
    setSelectedNodeIdsState(active.selectedNodeIds);
    setSelectedEdgeIdsState(active.selectedEdgeIds);
    setAlignLines([]);
    setConnectionHint(null);
    requestAnimationFrame(() => { void flow.fitView({ padding: 0.28, duration: 220 }); });
  }, [captureSnapshot, flow]);
  const enterContainer = useCallback((nodeId: string) => {
    const draft = persistActiveScope();
    navigateToScope(enterSopContainer(draft, scopePath, nodeId));
  }, [navigateToScope, persistActiveScope, scopePath]);
  const exitContainer = useCallback(() => {
    if (scopePath.length > 0) navigateToScope(scopePath.slice(0, -1));
  }, [navigateToScope, scopePath]);

  const onNodesChange: OnNodesChange<Node<SopFlowData>> = useCallback((changes) => {
    setNodes((current) => applyNodeChanges(changes, current));
    if (changes.some((change) => change.type !== "select" && change.type !== "dimensions" && change.type !== "position")) markDirty();
  }, [markDirty]);
  const onEdgesChange: OnEdgesChange<Edge<SopFlowEdgeData>> = useCallback((changes) => {
    setEdges((current) => applyEdgeChanges(changes, current));
    if (changes.some((change) => change.type !== "select")) markDirty();
  }, [markDirty]);

  const checkConnection = useCallback((connection: Parameters<typeof validateFlowConnection>[1]) => validateFlowConnection(nodes, connection), [nodes]);
  const onConnect = useCallback((connection: Connection) => {
    const result = checkConnection(connection);
    if (!result.valid) return setConnectionHint(result.reason);
    recordHistory();
    setEdges((current) => addEdge({ ...connection, id: uid("e"), type: "sop", data: { status: "valid" } }, current));
    setConnectionHint(null);
    markDirty();
  }, [checkConnection, markDirty, recordHistory]);

  const addNodeOfType = useCallback(<T extends BuiltinNodeType>(type: T, position?: { x: number; y: number }) => {
    const definition = builtinNodeRegistry.get(type)!;
    const config = definition.createDefaultConfig();
    const node = { kind: "builtin", id: uid("n"), type, version: definition.version, label: definition.label, position: position ?? { x: 240 + (nodes.length % 4) * 40, y: 80 + (nodes.length % 6) * 36 }, config, ports: definition.createPorts(config) } as WorkflowNode;
    recordHistory();
    setNodes((current) => [...current, { id: node.id, type: "sop", position: node.position, data: { node } }]);
    markDirty();
  }, [markDirty, nodes.length, recordHistory]);
  const onDragOver = useCallback((event: DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }, []);
  const onDrop = useCallback((event: DragEvent) => { event.preventDefault(); const type = event.dataTransfer.getData("application/sop-node"); if (builtinNodeRegistry.has(type)) addNodeOfType(type, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })); }, [addNodeOfType, flow]);

  const snapNode = useCallback((node: Node<SopFlowData>) => {
    const viewport = flow.getViewport();
    const size: SopNodeSize = { w: node.measured?.width ?? 168, h: node.measured?.height ?? 80 };
    const others: SopNodeBox[] = nodes.filter((item) => item.id !== node.id).map((item) => ({ id: item.id, position: item.position, size: { w: item.measured?.width ?? 168, h: item.measured?.height ?? 80 } }));
    return { viewport, snap: getSopAlignmentSnap(node.position, size, others, viewport) };
  }, [flow, nodes]);
  const onNodeDragStart: OnNodeDrag<Node<SopFlowData>> = useCallback(() => recordHistory(), [recordHistory]);
  const onNodeDrag: OnNodeDrag<Node<SopFlowData>> = useCallback((_event, node, draggedNodes) => {
    if (draggedNodes.length > 1) return setAlignLines([]);
    const { viewport, snap } = snapNode(node);
    setAlignLines(snap.guides);
    if (snap.dx !== 0 || snap.dy !== 0) setNodes((current) => current.map((item) => item.id === node.id ? { ...item, position: { x: node.position.x + snap.dx / viewport.zoom, y: node.position.y + snap.dy / viewport.zoom } } : item));
  }, [snapNode]);
  const onNodeDragStop: OnNodeDrag<Node<SopFlowData>> = useCallback((_event, node, draggedNodes) => {
    if (draggedNodes.length <= 1) {
      const { viewport, snap } = snapNode(node);
      if (snap.dx !== 0 || snap.dy !== 0) setNodes((current) => current.map((item) => item.id === node.id ? { ...item, position: { x: node.position.x + snap.dx / viewport.zoom, y: node.position.y + snap.dy / viewport.zoom } } : item));
    }
    setAlignLines([]);
    markDirty();
  }, [markDirty, snapNode]);

  const selectedNode = useMemo(() => selectedNodeIds.size === 1 ? nodes.find((node) => selectedNodeIds.has(node.id)) ?? null : null, [nodes, selectedNodeIds]);
  const selectedEdge = useMemo(() => selectedEdgeIds.size === 1 ? edges.find((edge) => selectedEdgeIds.has(edge.id)) ?? null : null, [edges, selectedEdgeIds]);
  const availableVariables = useMemo(() => {
    if (!selectedNode) return [];
    const draft = currentDraft();
    if (scopePath.length === 0) return getAvailableVariables(draft, selectedNode.id, {
      system: [{ key: "runId", label: "运行 ID", dataType: "string" }, { key: "currentTime", label: "当前时间", dataType: "string" }],
      environment: [{ key: "ORBIT_ENV", label: "运行环境", dataType: "string" }],
    });
    return [...getSopSubgraphVariablesAtPath(draft, scopePath, selectedNode.id), ...runtimeVariables];
  }, [currentDraft, scopePath, selectedNode]);
  const selectedDiagnostics = useMemo(() => validation?.diagnostics.filter((item) => item.location.kind === "workflow" || ("nodeId" in item.location && item.location.nodeId === selectedNode?.id)) ?? [], [selectedNode, validation]);
  const scopeCrumbs = useMemo(() => getSopScopeCrumbs({ ...persistActiveScope(), name }, scopePath), [name, persistActiveScope, scopePath]);

  const updateSelectedNode = useCallback((update: (node: WorkflowNode) => WorkflowNode) => {
    if (!selectedNode) return;
    recordHistory();
    const updated = refreshNodePorts(update(selectedNode.data.node));
    const nextNodes = nodes.map((item) => item.id === selectedNode.id ? { ...item, data: { ...item.data, node: updated } } : item);
    setNodes(nextNodes);
    setEdges((current) => reconcileFlowEdges(nextNodes, current));
    markDirty();
  }, [markDirty, nodes, recordHistory, selectedNode]);
  const updateSelectedEdgeLabel = useCallback((label: string) => { if (!selectedEdge) return; recordHistory(); setEdges((current) => current.map((edge) => edge.id === selectedEdge.id ? { ...edge, label } : edge)); markDirty(); }, [markDirty, recordHistory, selectedEdge]);
  const deleteSelected = useCallback(() => {
    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) return;
    recordHistory();
    const removing = new Set(selectedNodeIds);
    setNodes((current) => current.filter((node) => !removing.has(node.id)));
    setEdges((current) => current.filter((edge) => !selectedEdgeIds.has(edge.id) && !removing.has(edge.source) && !removing.has(edge.target)));
    setSelectedNodeIds(new Set());
    setSelectedEdgeIds(new Set());
    markDirty();
  }, [markDirty, recordHistory, selectedEdgeIds, selectedNodeIds, setSelectedEdgeIds, setSelectedNodeIds]);
  const duplicateSelected = useCallback(() => {
    const cloned = cloneSelectedGraph(nodes, edges, selectedNodeIds, uid);
    if (cloned.nodes.length === 0) return;
    recordHistory();
    setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), ...cloned.nodes]);
    setEdges((current) => [...current, ...cloned.edges]);
    setSelectedNodeIds(new Set(cloned.nodes.map((node) => node.id)));
    markDirty();
  }, [edges, markDirty, nodes, recordHistory, selectedNodeIds, setSelectedNodeIds]);

  const copySelected = useCallback(async () => {
    if (selectedNodeIds.size === 0) return;
    const text = serializeSelection(draftState.id, nodes, edges, selectedNodeIds);
    setClipboardText(text);
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
  }, [draftState.id, edges, nodes, selectedNodeIds]);
  const pasteSelected = useCallback(async () => {
    const text = navigator.clipboard?.readText ? await navigator.clipboard.readText().catch(() => clipboardText) : clipboardText;
    if (!text) return;
    const pasted = pasteSelection(text, uid);
    recordHistory();
    setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), ...pasted.nodes]);
    setEdges((current) => [...current, ...pasted.edges]);
    setSelectedNodeIds(new Set(pasted.nodes.map((node) => node.id)));
    markDirty();
  }, [clipboardText, markDirty, recordHistory, setSelectedNodeIds]);
  const undo = useCallback(() => {
    const result = undoHistory(history, captureSnapshot());
    if (!result) return;
    restoreSnapshot(result.snapshot);
    setHistory(result.history);
    markDirty();
  }, [captureSnapshot, history, markDirty, restoreSnapshot]);
  const redo = useCallback(() => {
    const result = redoHistory(history, captureSnapshot());
    if (!result) return;
    restoreSnapshot(result.snapshot);
    setHistory(result.history);
    markDirty();
  }, [captureSnapshot, history, markDirty, restoreSnapshot]);
  const autoLayout = useCallback(async (direction: "LR" | "TB") => {
    recordHistory();
    const laidOut = await layoutFlowGraph(nodes, edges, direction, selectedNodeIds);
    setNodes(laidOut);
    markDirty();
    requestAnimationFrame(() => { void flow.fitView({ nodes: laidOut, padding: 0.25, duration: 250 }); });
  }, [edges, flow, markDirty, nodes, recordHistory, selectedNodeIds]);
  const toggleSelectedPinned = useCallback(() => {
    if (selectedNodeIds.size === 0) return;
    recordHistory();
    const shouldPin = nodes.some((node) => selectedNodeIds.has(node.id) && node.draggable !== false);
    setPinnedNodeKeys((current) => {
      const next = new Set(current);
      for (const nodeId of selectedNodeIds) shouldPin ? next.add(scopeNodeKey(scopePath, nodeId)) : next.delete(scopeNodeKey(scopePath, nodeId));
      return next;
    });
    setNodes((current) => current.map((node) => selectedNodeIds.has(node.id) ? { ...node, draggable: !shouldPin } : node));
  }, [nodes, recordHistory, scopePath, selectedNodeIds]);
  const toggleSelectedCollapsed = useCallback(() => {
    if (!selectedNode) return;
    recordHistory();
    const key = scopeNodeKey(scopePath, selectedNode.id);
    const willCollapse = !selectedNode.data.collapsed;
    setCollapsedNodeKeys((current) => {
      const next = new Set(current);
      willCollapse ? next.add(key) : next.delete(key);
      return next;
    });
    setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, collapsed: willCollapse } } : node));
  }, [recordHistory, scopePath, selectedNode]);

  const focusNode = useCallback((nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return;
    setSelectedNodeIds(new Set([nodeId]));
    setSelectedEdgeIds(new Set());
    setNodes((current) => current.map((item) => ({ ...item, selected: item.id === nodeId })));
    void flow.fitView({ nodes: [node], padding: 0.5, duration: 250 });
  }, [flow, nodes, setSelectedEdgeIds, setSelectedNodeIds]);
  const fitSelection = useCallback(() => { const selected = nodes.filter((node) => selectedNodeIds.has(node.id)); if (selected.length > 0) void flow.fitView({ nodes: selected, padding: 0.35, duration: 250 }); }, [flow, nodes, selectedNodeIds]);
  const resizeViewport = useCallback((previous: SopCanvasSize, next: SopCanvasSize) => {
    void flow.setViewport(centerViewportAfterResize(flow.getViewport(), previous, next), { duration: 180 });
  }, [flow]);
  const searchMatches = useMemo(() => { const query = searchQuery.trim().toLowerCase(); return query ? nodes.filter((node) => `${node.data.node.label} ${node.data.node.type}`.toLowerCase().includes(query)) : []; }, [nodes, searchQuery]);

  const runValidation = useCallback(() => {
    setDebugState({ status: "validating" });
    const result = validateSop(currentDraft());
    setValidation(result);
    setNodes((current) => current.map((node) => ({ ...node, data: { ...node.data, issueCount: result.diagnostics.filter((item) => "nodeId" in item.location && item.location.nodeId === node.id).length } })));
    setDebugState(result.ok ? { status: "ready", message: "发布前校验通过" } : { status: "error", message: `${result.errors.length} 个阻断问题` });
  }, [currentDraft]);
  const clearValidation = useCallback(() => { setValidation(null); setDebugState({ status: "idle" }); setNodes((current) => current.map((node) => ({ ...node, data: { ...node.data, issueCount: 0 } }))); }, []);
  const clearRunState = useCallback(() => {
    setNodes((current) => current.map((node) => ({ ...node, data: { ...node.data, runStatus: undefined, runAttempt: undefined } })));
    setEdges((current) => current.map((edge) => ({ ...edge, data: mergeEdgeData(edge, { runtimeActive: false, runtimeTraversed: false, runtimeExcluded: false }) })));
  }, []);
  const applyRunEvent = useCallback((event: WorkflowRuntimeEvent) => {
    if (event.type === "node.output" && typeof event.output.selected === "string") {
      setEdges((current) => current.map((edge) => edge.source === event.nodeId
        ? { ...edge, data: mergeEdgeData(edge, { runtimeExcluded: edge.sourceHandle !== event.output.selected }) }
        : edge));
      return;
    }
    if (event.type !== "node.status") return;
    setNodes((current) => current.map((node) => node.id === event.nodeId
      ? { ...node, data: { ...node.data, runStatus: event.status, runAttempt: event.attempt } }
      : node));
    if (event.status === "running" || event.status === "waiting") {
      setEdges((current) => current.map((edge) => edge.target === event.nodeId && edge.data?.runtimeExcluded !== true
        ? { ...edge, data: mergeEdgeData(edge, { runtimeActive: true }) }
        : edge));
    } else if (["succeeded", "failed", "cancelled"].includes(event.status)) {
      setEdges((current) => current.map((edge) => edge.target === event.nodeId && edge.data?.runtimeExcluded !== true
        ? { ...edge, data: mergeEdgeData(edge, { runtimeActive: false, runtimeTraversed: true }) }
        : edge));
    } else if (event.status === "skipped") {
      setEdges((current) => current.map((edge) => edge.target === event.nodeId
        ? { ...edge, data: mergeEdgeData(edge, { runtimeActive: false }) }
        : edge));
    }
  }, []);
  const openJsonExport = useCallback(() => { setJsonText(JSON.stringify(currentDraft(), null, 2)); setJsonError(null); setShowJsonPanel(true); }, [currentDraft]);
  const importJson = useCallback(() => {
    try {
      const parsed = (() => { try { return parseWorkflowDraftJson(jsonText); } catch (error) { const raw = JSON.parse(jsonText) as unknown; if (raw && typeof raw === "object" && !("schemaVersion" in raw)) return migrateSopDraftV1(raw); throw error; } })();
      recordHistory();
      const active = createScopeFlow(parsed, [], {}, new Set(), new Set());
      setDraftState(parsed);
      setNameState(parsed.name);
      setSummaryState(parsed.summary);
      setScopePath([]);
      setScopeSelections({});
      setCollapsedNodeKeys(new Set());
      setPinnedNodeKeys(new Set());
      setNodes(active.nodes);
      setEdges(active.edges);
      setSelectedNodeIdsState(new Set());
      setSelectedEdgeIdsState(new Set());
      setJsonError(null);
      setShowJsonPanel(false);
      markDirty();
    } catch (error) { setJsonError(error instanceof Error ? error.message : String(error)); }
  }, [jsonText, markDirty, recordHistory]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      else if (command && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
      else if (command && event.key.toLowerCase() === "c") { event.preventDefault(); void copySelected(); }
      else if (command && event.key.toLowerCase() === "v") { event.preventDefault(); void pasteSelected(); }
      else if (command && event.key.toLowerCase() === "a") { event.preventDefault(); setSelectedNodeIds(new Set(nodes.map((node) => node.id))); setNodes((current) => current.map((node) => ({ ...node, selected: true }))); }
      else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelected(); }
      else if (event.key === "Escape") { setSelectedNodeIds(new Set()); setSelectedEdgeIds(new Set()); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copySelected, deleteSelected, nodes, pasteSelected, redo, setSelectedEdgeIds, setSelectedNodeIds, undo]);

  return {
    nodes, edges, name, summary, scopePath, scopeCrumbs, selectedNodeIds, selectedEdgeIds, selectedNode, selectedEdge, validation, selectedDiagnostics, availableVariables,
    alignLines, showJsonPanel, jsonText, jsonError, dirtyRevision, debugState, connectionHint, searchQuery, searchMatches,
    canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    setName, setSummary, setSelectedNodeIds, setSelectedEdgeIds, setShowJsonPanel, setJsonText, setJsonError, setConnectionHint, setSearchQuery,
    onNodesChange, onEdgesChange, onConnect, checkConnection, addNodeOfType, onDragOver, onDrop, onNodeDragStart, onNodeDrag, onNodeDragStop,
    updateSelectedNode, updateSelectedEdgeLabel, deleteSelected, duplicateSelected, copySelected, pasteSelected, undo, redo, autoLayout,
    toggleSelectedPinned, toggleSelectedCollapsed, enterContainer, exitContainer, navigateToScope, focusNode, fitSelection, resizeViewport, runValidation, currentDraft, openJsonExport, importJson, clearValidation,
    clearRunState, applyRunEvent,
  };
}
