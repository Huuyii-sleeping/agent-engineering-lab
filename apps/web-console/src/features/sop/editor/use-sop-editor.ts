import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { addEdge, applyEdgeChanges, applyNodeChanges, useReactFlow, type Connection, type Edge, type Node, type OnEdgesChange, type OnNodeDrag, type OnNodesChange } from "@xyflow/react";
import { builtinNodeRegistry, getAvailableVariables, migrateSopDraftV1, refreshNodePorts, type BuiltinNodeType, type WorkflowDraft, type WorkflowNode } from "@orbit/workflow-core";
import { getSopAlignmentSnap, type SopAlignmentGuide, type SopNodeBox, type SopNodeSize } from "../lib/sop-alignment";
import { validateSop, type SopValidation } from "../lib/sop-validate";
import { buildWorkflowDraft, parseWorkflowDraftJson, toFlowEdges, toFlowNodes, type SopFlowData, type SopFlowEdgeData } from "./sop-flow-adapter";
import { cloneSelectedGraph } from "./sop-selection";
import { pasteSelection, serializeSelection } from "./sop-clipboard";
import { pushHistory, redoHistory, undoHistory, type EditorHistory } from "./sop-history";
import { layoutFlowGraph } from "./sop-layout";
import { reconcileFlowEdges, validateFlowConnection } from "./sop-connections";

type DebugState = { status: "idle" | "validating" | "ready" | "error"; message?: string };
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** 集中管理 SOP 编辑器的图、选择、历史、视口、校验和调试状态。 */
export function useSopEditor(initial: WorkflowDraft) {
  const flow = useReactFlow<Node<SopFlowData>, Edge<SopFlowEdgeData>>();
  const [nodes, setNodes] = useState<Node<SopFlowData>[]>(() => toFlowNodes(initial));
  const [edges, setEdges] = useState<Edge<SopFlowEdgeData>[]>(() => toFlowEdges(initial));
  const [name, setNameState] = useState(initial.name);
  const [summary, setSummaryState] = useState(initial.summary);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(new Set());
  const [validation, setValidation] = useState<SopValidation | null>(null);
  const [alignLines, setAlignLines] = useState<SopAlignmentGuide[]>([]);
  const [showJsonPanel, setShowJsonPanel] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [dirtyRevision, setDirtyRevision] = useState(0);
  const [debugState, setDebugState] = useState<DebugState>({ status: "idle" });
  const [connectionHint, setConnectionHint] = useState<string | null>(null);
  const [history, setHistory] = useState<EditorHistory>({ past: [], future: [] });
  const [clipboardText, setClipboardText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const markDirty = useCallback(() => {
    setDirtyRevision((revision) => revision + 1);
    setValidation(null);
    setDebugState({ status: "idle" });
  }, []);
  const recordHistory = useCallback(() => setHistory((current) => pushHistory(current, { nodes, edges })), [edges, nodes]);
  const setName = useCallback((value: string) => { setNameState(value); markDirty(); }, [markDirty]);
  const setSummary = useCallback((value: string) => { setSummaryState(value); markDirty(); }, [markDirty]);
  const currentDraft = useCallback(() => buildWorkflowDraft(initial, name, summary, nodes, edges), [edges, initial, name, nodes, summary]);

  const onNodesChange: OnNodesChange<Node<SopFlowData>> = useCallback((changes) => {
    setNodes((current) => applyNodeChanges(changes, current));
    if (changes.some((change) => change.type !== "select" && change.type !== "dimensions" && change.type !== "position")) markDirty();
  }, [markDirty]);
  const onEdgesChange: OnEdgesChange<Edge<SopFlowEdgeData>> = useCallback((changes) => {
    setEdges((current) => applyEdgeChanges(changes, current));
    if (changes.some((change) => change.type !== "select")) markDirty();
  }, [markDirty]);

  const checkConnection = useCallback((connection: Connection) => validateFlowConnection(nodes, connection), [nodes]);
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
  const availableVariables = useMemo(() => selectedNode ? getAvailableVariables(currentDraft(), selectedNode.id, { system: [{ key: "runId", label: "运行 ID", dataType: "string" }, { key: "currentTime", label: "当前时间", dataType: "string" }], environment: [{ key: "ORBIT_ENV", label: "运行环境", dataType: "string" }] }) : [], [currentDraft, selectedNode]);
  const selectedDiagnostics = useMemo(() => validation?.diagnostics.filter((item) => item.location.kind === "workflow" || ("nodeId" in item.location && item.location.nodeId === selectedNode?.id)) ?? [], [selectedNode, validation]);

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
    setSelectedNodeIds(new Set()); setSelectedEdgeIds(new Set()); markDirty();
  }, [markDirty, recordHistory, selectedEdgeIds, selectedNodeIds]);
  const duplicateSelected = useCallback(() => {
    const cloned = cloneSelectedGraph(nodes, edges, selectedNodeIds, uid);
    if (cloned.nodes.length === 0) return;
    recordHistory();
    setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), ...cloned.nodes]);
    setEdges((current) => [...current, ...cloned.edges]);
    setSelectedNodeIds(new Set(cloned.nodes.map((node) => node.id))); markDirty();
  }, [edges, markDirty, nodes, recordHistory, selectedNodeIds]);

  const copySelected = useCallback(async () => {
    if (selectedNodeIds.size === 0) return;
    const text = serializeSelection(initial.id, nodes, edges, selectedNodeIds);
    setClipboardText(text);
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
  }, [edges, initial.id, nodes, selectedNodeIds]);
  const pasteSelected = useCallback(async () => {
    const text = navigator.clipboard?.readText ? await navigator.clipboard.readText().catch(() => clipboardText) : clipboardText;
    if (!text) return;
    const pasted = pasteSelection(text, uid);
    recordHistory();
    setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), ...pasted.nodes]);
    setEdges((current) => [...current, ...pasted.edges]);
    setSelectedNodeIds(new Set(pasted.nodes.map((node) => node.id))); markDirty();
  }, [clipboardText, markDirty, recordHistory]);
  const undo = useCallback(() => { const result = undoHistory(history, { nodes, edges }); if (!result) return; setNodes(result.snapshot.nodes); setEdges(result.snapshot.edges); setHistory(result.history); markDirty(); }, [edges, history, markDirty, nodes]);
  const redo = useCallback(() => { const result = redoHistory(history, { nodes, edges }); if (!result) return; setNodes(result.snapshot.nodes); setEdges(result.snapshot.edges); setHistory(result.history); markDirty(); }, [edges, history, markDirty, nodes]);
  const autoLayout = useCallback(async (direction: "LR" | "TB") => {
    recordHistory();
    const laidOut = await layoutFlowGraph(nodes, edges, direction, selectedNodeIds);
    setNodes(laidOut);
    markDirty();
    requestAnimationFrame(() => { void flow.fitView({ nodes: laidOut, padding: 0.25, duration: 250 }); });
  }, [edges, flow, markDirty, nodes, recordHistory, selectedNodeIds]);
  const toggleSelectedPinned = useCallback(() => { if (selectedNodeIds.size === 0) return; recordHistory(); const shouldPin = nodes.some((node) => selectedNodeIds.has(node.id) && node.draggable !== false); setNodes((current) => current.map((node) => selectedNodeIds.has(node.id) ? { ...node, draggable: !shouldPin } : node)); markDirty(); }, [markDirty, nodes, recordHistory, selectedNodeIds]);
  const toggleSelectedCollapsed = useCallback(() => { if (!selectedNode) return; setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, collapsed: !node.data.collapsed } } : node)); }, [selectedNode]);

  const focusNode = useCallback((nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return;
    setSelectedNodeIds(new Set([nodeId])); setSelectedEdgeIds(new Set());
    setNodes((current) => current.map((item) => ({ ...item, selected: item.id === nodeId })));
    void flow.fitView({ nodes: [node], padding: 0.5, duration: 250 });
  }, [flow, nodes]);
  const fitSelection = useCallback(() => { const selected = nodes.filter((node) => selectedNodeIds.has(node.id)); if (selected.length > 0) void flow.fitView({ nodes: selected, padding: 0.35, duration: 250 }); }, [flow, nodes, selectedNodeIds]);
  const searchMatches = useMemo(() => { const query = searchQuery.trim().toLowerCase(); return query ? nodes.filter((node) => `${node.data.node.label} ${node.data.node.type}`.toLowerCase().includes(query)) : []; }, [nodes, searchQuery]);

  const runValidation = useCallback(() => {
    setDebugState({ status: "validating" });
    const result = validateSop(currentDraft());
    setValidation(result);
    setNodes((current) => current.map((node) => ({ ...node, data: { ...node.data, issueCount: result.diagnostics.filter((item) => "nodeId" in item.location && item.location.nodeId === node.id).length } })));
    setDebugState(result.ok ? { status: "ready", message: "发布前校验通过" } : { status: "error", message: `${result.errors.length} 个阻断问题` });
  }, [currentDraft]);
  const clearValidation = useCallback(() => { setValidation(null); setDebugState({ status: "idle" }); setNodes((current) => current.map((node) => ({ ...node, data: { ...node.data, issueCount: 0 } }))); }, []);
  const openJsonExport = useCallback(() => { setJsonText(JSON.stringify(currentDraft(), null, 2)); setJsonError(null); setShowJsonPanel(true); }, [currentDraft]);
  const importJson = useCallback(() => {
    try {
      const parsed = (() => { try { return parseWorkflowDraftJson(jsonText); } catch (error) { const raw = JSON.parse(jsonText) as unknown; if (raw && typeof raw === "object" && !("schemaVersion" in raw)) return migrateSopDraftV1(raw); throw error; } })();
      recordHistory(); setNameState(parsed.name); setSummaryState(parsed.summary); setNodes(toFlowNodes(parsed)); setEdges(toFlowEdges(parsed)); setJsonError(null); setShowJsonPanel(false); markDirty();
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
  }, [copySelected, deleteSelected, nodes, pasteSelected, redo, undo]);

  return {
    nodes, edges, name, summary, selectedNodeIds, selectedEdgeIds, selectedNode, selectedEdge, validation, selectedDiagnostics, availableVariables,
    alignLines, showJsonPanel, jsonText, jsonError, dirtyRevision, debugState, connectionHint, searchQuery, searchMatches,
    canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    setName, setSummary, setSelectedNodeIds, setSelectedEdgeIds, setShowJsonPanel, setJsonText, setJsonError, setConnectionHint, setSearchQuery,
    onNodesChange, onEdgesChange, onConnect, checkConnection, addNodeOfType, onDragOver, onDrop, onNodeDragStart, onNodeDrag, onNodeDragStop,
    updateSelectedNode, updateSelectedEdgeLabel, deleteSelected, duplicateSelected, copySelected, pasteSelected, undo, redo, autoLayout,
    toggleSelectedPinned, toggleSelectedCollapsed, focusNode, fitSelection, runValidation, currentDraft, openJsonExport, importJson, clearValidation,
  };
}
