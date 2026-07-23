import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkflowDraft, WorkflowRuntimeEvent } from "@orbit/workflow-core";
import { SopConnectionLine, SopEdge } from "../../components/SopEdge";
import { SopNodeView } from "../../components/SopNodeView";
import { getSopNodeMeta } from "../../lib/sop-catalog";
import { useSopEditor } from "../use-sop-editor";
import type { SopFlowData, SopFlowEdgeData } from "../sop-flow-adapter";
import { SopAlignmentOverlay } from "./SopAlignmentOverlay";
import { SopInspector } from "./SopInspector";
import { SopPalette } from "./SopPalette";
import { SopToolbar } from "./SopToolbar";
import { SopRunPanel } from "../../runs/components/SopRunPanel";
import { useSopRun } from "../../runs/use-sop-run";

const nodeTypes = { sop: SopNodeView };
const edgeTypes = { sop: SopEdge };

/** SOP 编辑器外壳，负责组合画布、工具栏、节点库和检查器。 */
export function SopCanvasShell({ initial, legacyBackup, onSave, onAutoSave, onRecoveryChange, onBack, onOpenLifecycle }: {
  initial: WorkflowDraft;
  legacyBackup: string | null;
  onSave: (draft: WorkflowDraft) => void | Promise<void>;
  onAutoSave?: (draft: WorkflowDraft) => void | Promise<void>;
  onRecoveryChange?: (draft: WorkflowDraft) => void;
  onBack: () => void;
  onOpenLifecycle: () => void;
}) {
  const editor = useSopEditor(initial);
  const handleRunEvent = useCallback((event: WorkflowRuntimeEvent) => {
    editor.applyRunEvent(event);
    if (event.type === "node.status" && event.status === "failed") editor.focusNode(event.nodeId);
  }, [editor.applyRunEvent, editor.focusNode]);
  const run = useSopRun({ draft: editor.currentDraft, onEvent: handleRunEvent, onReset: editor.clearRunState });
  const [interactionMode, setInteractionMode] = useState<"select" | "pan">("select");
  const [openPanel, setOpenPanel] = useState<"palette" | "inspector" | null>(null);
  const lastConnectionCheck = useRef<{ valid: boolean; reason?: string } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const currentDraftRef = useRef(editor.currentDraft);
  const autoSaveRef = useRef(onAutoSave);
  const recoveryChangeRef = useRef(onRecoveryChange);
  currentDraftRef.current = editor.currentDraft;
  autoSaveRef.current = onAutoSave;
  recoveryChangeRef.current = onRecoveryChange;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === "Escape") {
        setOpenPanel(null);
        return;
      }
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key.toLowerCase() === "h") setInteractionMode("pan");
      else if (event.key.toLowerCase() === "v") setInteractionMode("select");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (editor.showJsonPanel || editor.selectedNodeIds.size > 0 || editor.selectedEdgeIds.size > 0) setOpenPanel("inspector");
  }, [editor.selectedEdgeIds.size, editor.selectedNodeIds.size, editor.showJsonPanel]);

  useEffect(() => {
    if (editor.dirtyRevision === 0) return;
    const draft = currentDraftRef.current();
    recoveryChangeRef.current?.(draft);
    const timer = window.setTimeout(() => {
      void autoSaveRef.current?.(currentDraftRef.current());
    }, 900);
    return () => window.clearTimeout(timer);
  }, [editor.dirtyRevision]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    let previous: { width: number; height: number } | null = null;
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      if (!previous) {
        previous = next;
        return;
      }
      const before = previous;
      previous = next;
      if (Math.abs(next.width - before.width) < 1 && Math.abs(next.height - before.height) < 1) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => editor.resizeViewport(before, next));
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [editor.resizeViewport]);

  return (
    <div className={`sop-wrap ${openPanel ? "has-open-panel" : ""}`}>
      {openPanel ? <button type="button" className="sop-panel-scrim" aria-label="关闭辅助面板" onClick={() => setOpenPanel(null)} /> : null}
      <SopToolbar
        name={editor.name}
        summary={editor.summary}
        dirtyRevision={editor.dirtyRevision}
        debugState={editor.debugState}
        legacyBackup={legacyBackup}
        onNameChange={editor.setName}
        onSummaryChange={editor.setSummary}
        onBack={onBack}
        onValidate={editor.runValidation}
        onSave={() => { void onSave(editor.currentDraft()); }}
        onOpenLifecycle={onOpenLifecycle}
        onExportJson={editor.openJsonExport}
        onImportText={(text) => { editor.setJsonText(text); editor.setJsonError(null); editor.setShowJsonPanel(true); }}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        searchQuery={editor.searchQuery}
        searchCount={editor.searchMatches.length}
        onSearchChange={editor.setSearchQuery}
        onFocusSearch={() => { const match = editor.searchMatches[0]; if (match) editor.focusNode(match.id); }}
        onUndo={editor.undo}
        onRedo={editor.redo}
        interactionMode={interactionMode}
        onInteractionModeChange={setInteractionMode}
        onLayout={editor.autoLayout}
        onFitSelection={editor.fitSelection}
        onTogglePin={editor.toggleSelectedPinned}
        canTestNode={Boolean(editor.selectedNode)}
        onTestNode={() => { void run.prepare("node-test"); }}
        onRunDraft={() => { void run.prepare("draft"); }}
        onRunProduction={() => { void run.prepare("production"); }}
        paletteOpen={openPanel === "palette"}
        inspectorOpen={openPanel === "inspector"}
        onTogglePalette={() => setOpenPanel((current) => current === "palette" ? null : "palette")}
        onToggleInspector={() => setOpenPanel((current) => current === "inspector" ? null : "inspector")}
      />
      <div className="sop-editor-body">
        <SopPalette open={openPanel === "palette"} onAdd={editor.addNodeOfType} onClose={() => setOpenPanel(null)} />
        <div className="sop-workspace">
          <div className="sop-workspace-body">
            <div className="sop-main">
              <div ref={canvasRef} className={interactionMode === "pan" ? "sop-canvas is-pan-mode" : "sop-canvas"} onDragOver={editor.onDragOver} onDrop={editor.onDrop}>
                <ReactFlow<Node<SopFlowData>, Edge<SopFlowEdgeData>>
                nodes={editor.nodes}
                edges={editor.edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={editor.onNodesChange}
                onEdgesChange={editor.onEdgesChange}
                onConnect={editor.onConnect}
                isValidConnection={(connection) => {
                  const result = editor.checkConnection(connection);
                  lastConnectionCheck.current = result;
                  return result.valid;
                }}
                onConnectStart={() => editor.setConnectionHint(null)}
                onConnectEnd={() => {
                  const result = lastConnectionCheck.current;
                  if (result && !result.valid) editor.setConnectionHint(result.reason ?? "连线不兼容。");
                }}
                connectionMode={ConnectionMode.Loose}
                onSelectionChange={({ nodes, edges }) => { editor.setSelectedNodeIds(new Set(nodes.map((node) => node.id))); editor.setSelectedEdgeIds(new Set(edges.map((edge) => edge.id))); }}
                onPaneClick={() => { if (interactionMode === "select") { editor.setSelectedNodeIds(new Set()); editor.setSelectedEdgeIds(new Set()); } }}
                onNodeDrag={editor.onNodeDrag}
                onNodeDragStart={editor.onNodeDragStart}
                onNodeDragStop={editor.onNodeDragStop}
                multiSelectionKeyCode="Shift"
                selectionOnDrag={interactionMode === "select"}
                panOnDrag={interactionMode === "pan" ? true : [1, 2]}
                nodesDraggable={interactionMode === "select"}
                nodesConnectable={interactionMode === "select"}
                elementsSelectable={interactionMode === "select"}
                deleteKeyCode={null}
                fitView
                defaultEdgeOptions={{ type: "sop" }}
                connectionRadius={40}
                connectionLineType="smoothstep"
                connectionLineComponent={SopConnectionLine}
                connectionLineStyle={{ stroke: "#22c55e", strokeWidth: 2.2, strokeDasharray: "6 4" }}
                proOptions={{ hideAttribution: true }}
                onlyRenderVisibleElements
              >
                <Background variant={BackgroundVariant.Lines} gap={24} size={1} color="rgba(255,255,255,0.07)" />
                <Controls showInteractive={false} />
                <MiniMap pannable zoomable nodeColor={(node) => getSopNodeMeta((node.data as SopFlowData).node.type).color} maskColor="rgba(0,0,0,0.35)" />
                <SopAlignmentOverlay guides={editor.alignLines} />
                </ReactFlow>
                {editor.connectionHint ? <div className="sop-connection-hint">{editor.connectionHint}</div> : null}
              </div>
            </div>
            <SopInspector
              open={openPanel === "inspector"}
              showJson={editor.showJsonPanel}
              name={editor.name}
              jsonText={editor.jsonText}
              jsonError={editor.jsonError}
              selectedNodeIds={editor.selectedNodeIds}
              selectedNode={editor.selectedNode}
              selectedEdge={editor.selectedEdge}
              validation={editor.validation}
              availableVariables={editor.availableVariables}
              selectedDiagnostics={editor.selectedDiagnostics}
              onJsonTextChange={(text) => { editor.setJsonText(text); editor.setJsonError(null); }}
              onImportJson={editor.importJson}
              onCloseJson={() => editor.setShowJsonPanel(false)}
              onUpdateNode={editor.updateSelectedNode}
              onUpdateEdgeLabel={editor.updateSelectedEdgeLabel}
              onDelete={editor.deleteSelected}
              onDuplicate={editor.duplicateSelected}
              onClearValidation={editor.clearValidation}
              onFocusNode={editor.focusNode}
              onToggleCollapsed={editor.toggleSelectedCollapsed}
              onClose={() => setOpenPanel(null)}
            />
          </div>
          <SopRunPanel
            open={run.open}
            mode={run.mode}
            phase={run.phase}
            draft={editor.currentDraft()}
            selectedNode={editor.selectedNode?.data.node ?? null}
            run={run.run}
            events={run.events}
            versions={run.versions}
            message={run.message}
            onStart={(input) => { void run.start(input); }}
            onCancel={() => { void run.cancel(); }}
            onClose={run.close}
          />
        </div>
      </div>
    </div>
  );
}
