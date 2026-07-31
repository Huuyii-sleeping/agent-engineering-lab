import { useCallback, useEffect, useRef, useState } from "react";
import {
  isTerminalWorkflowRunStatus,
  type WorkflowDraft,
  type WorkflowRunMode,
  type WorkflowRunSnapshot,
  type WorkflowRuntimeEvent,
} from "@orbit/workflow-core";
import {
  cancelWorkflowRun,
  createWorkflowRunEventStream,
  fetchSopVersions,
  fetchWorkflowRun,
  resumeWorkflowRun,
  startWorkflowRun,
  type SopVersionSummary,
  type WorkflowRunEventStream,
} from "../../../api";
import { appendWorkflowRuntimeEvent, applyWorkflowRuntimeEvent } from "./run-state";

export type SopRunPhase = "idle" | "preparing" | "starting" | "running" | "terminal" | "error";

/** SOP 运行控制 hook，集中处理启动、SSE 去重、终态和取消。 */
export function useSopRun(input: {
  draft: () => WorkflowDraft;
  onEvent: (event: WorkflowRuntimeEvent) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<WorkflowRunMode>("draft");
  const [phase, setPhase] = useState<SopRunPhase>("idle");
  const [run, setRun] = useState<WorkflowRunSnapshot | null>(null);
  const [events, setEvents] = useState<WorkflowRuntimeEvent[]>([]);
  const [versions, setVersions] = useState<SopVersionSummary[]>([]);
  const [message, setMessage] = useState("");
  const [decisionPending, setDecisionPending] = useState(false);
  const streamRef = useRef<WorkflowRunEventStream | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.close();
    streamRef.current = null;
  }, []);

  useEffect(() => stopStream, [stopStream]);

  const prepare = useCallback(async (nextMode: WorkflowRunMode) => {
    stopStream();
    input.onReset();
    setOpen(true);
    setMode(nextMode);
    setRun(null);
    setEvents([]);
    setMessage("");
    setDecisionPending(false);
    if (nextMode !== "production") {
      setPhase("idle");
      return;
    }
    setPhase("preparing");
    try {
      setVersions(await fetchSopVersions(input.draft().id));
      setPhase("idle");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [input, stopStream]);

  const start = useCallback(async (options: {
    inputs: Record<string, unknown>;
    nodeInputs: Record<string, unknown>;
    targetNodeId?: string;
    versionId?: string;
  }) => {
    stopStream();
    input.onReset();
    setRun(null);
    setEvents([]);
    setMessage("");
    setDecisionPending(false);
    setPhase("starting");
    try {
      const draft = input.draft();
      const started = await startWorkflowRun({
        workflowId: draft.id,
        mode,
        versionId: options.versionId,
        draft: mode === "production" ? undefined : draft,
        inputs: options.inputs,
        targetNodeId: options.targetNodeId,
        nodeInputs: options.nodeInputs,
      });
      setRun(started);
      setPhase("running");
      streamRef.current = createWorkflowRunEventStream({
        runId: started.id,
        onEvent: (event) => {
          setEvents((current) => appendWorkflowRuntimeEvent(current, event));
          setRun((current) => current ? applyWorkflowRuntimeEvent(current, event) : current);
          input.onEvent(event);
        },
        onError: () => setMessage("事件流正在重连，已接收事件不会重复显示。"),
        onTerminal: () => {
          setPhase("terminal");
          setMessage("");
          void fetchWorkflowRun(started.id).then(setRun).catch((error: unknown) => {
            setMessage(error instanceof Error ? error.message : String(error));
          });
        },
      });
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [input, mode, stopStream]);

  const cancel = useCallback(async () => {
    if (!run) return;
    try {
      await cancelWorkflowRun(run.id);
      setMessage("取消请求已发送，正在等待执行器停止。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [run]);

  const resume = useCallback(async (decision: {
    interruptId: string;
    action: "approve" | "reject";
    data: Record<string, unknown>;
    idempotencyKey: string;
  }) => {
    if (!run || run.status !== "waiting") return;
    const waiting = run.waiting?.waiting;
    if (!waiting || (waiting.interruptId !== decision.interruptId && waiting.approvalRequestId !== decision.interruptId)) {
      setMessage("当前决定不属于正在查看的 Workflow run。");
      return;
    }
    setDecisionPending(true);
    setMessage(decision.action === "approve" ? "正在恢复同意分支…" : "正在恢复拒绝分支…");
    try {
      const resumed = await resumeWorkflowRun(run.id, decision);
      setRun(resumed);
      setPhase(isTerminalWorkflowRunStatus(resumed.status) ? "terminal" : "running");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setDecisionPending(false);
    }
  }, [run]);

  const close = useCallback(() => {
    stopStream();
    setDecisionPending(false);
    setOpen(false);
  }, [stopStream]);

  return { open, mode, phase, run, events, versions, message, decisionPending, prepare, start, cancel, resume, close };
}
