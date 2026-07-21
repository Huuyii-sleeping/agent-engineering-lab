import { useEffect, useMemo, useState } from "react";
import { Ban, Braces, CircleStop, Clock3, FlaskConical, ListTree, Play, Radio, RotateCcw, X } from "lucide-react";
import type {
  NodePort,
  StartNodeConfig,
  WorkflowDraft,
  WorkflowNode,
  WorkflowRunMode,
  WorkflowRunSnapshot,
  WorkflowRuntimeEvent,
} from "@orbit/workflow-core";
import type { SopVersionSummary } from "../../../../api";
import type { SopRunPhase } from "../use-sop-run";

type InputField = { id: string; name: string; dataType: NodePort["dataType"]; required?: boolean; defaultValue?: unknown };

const statusLabel: Record<string, string> = {
  queued: "排队中",
  pending: "等待",
  ready: "就绪",
  running: "执行中",
  waiting: "等待输入",
  succeeded: "成功",
  failed: "失败",
  skipped: "已跳过",
  cancelled: "已取消",
};

function modeLabel(mode: WorkflowRunMode): string {
  return mode === "node-test" ? "单节点试运行" : mode === "draft" ? "草稿试运行" : "发布版本运行";
}

function workflowFields(draft: WorkflowDraft): InputField[] {
  const start = draft.nodes.find((node) => node.kind === "builtin" && node.type === "start");
  if (!start || start.kind !== "builtin" || start.type !== "start") return [];
  return (start.config as StartNodeConfig).inputs;
}

function parseInput(raw: string, field: InputField): unknown {
  if (!raw.trim()) return field.defaultValue;
  if (field.dataType === "number") {
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`${field.name} 必须是数字。`);
    return value;
  }
  if (field.dataType === "boolean") {
    if (raw === "true") return true;
    if (raw === "false") return false;
    throw new Error(`${field.name} 必须是 true 或 false。`);
  }
  if (field.dataType === "object" || field.dataType === "array") return JSON.parse(raw) as unknown;
  if (field.dataType === "any") {
    try { return JSON.parse(raw) as unknown; } catch { return raw; }
  }
  return raw;
}

function collectInputs(fields: InputField[], values: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const value = parseInput(values[field.id] ?? "", field);
    if (value === undefined && field.required) throw new Error(`${field.name} 是必填输入。`);
    if (value !== undefined) result[field.id] = value;
  }
  return result;
}

function json(value: unknown): string {
  return value === undefined ? "—" : JSON.stringify(value, null, 2);
}

function eventSummary(event: WorkflowRuntimeEvent): string {
  if (event.type === "run.status") return `运行 ${statusLabel[event.status] ?? event.status}`;
  if (event.type === "node.status") return `${event.nodeId} · ${statusLabel[event.status] ?? event.status} · attempt ${event.attempt}`;
  if (event.type === "node.log") return `${event.nodeId} · ${event.message}`;
  if (event.type === "node.output") return `${event.nodeId} · ${event.delta ? `增量 ${event.delta}` : "输出已更新"}`;
  if (event.type === "run.output") return "工作流输出已生成";
  return `${event.nodeId} · ${event.reason}`;
}

function InputControl({ field, value, onChange }: { field: InputField; value: string; onChange: (value: string) => void }) {
  const multiline = field.dataType === "object" || field.dataType === "array" || field.dataType === "any";
  return (
    <label className="sop-run-field">
      <span>{field.name}{field.required ? <b>*</b> : null}<code>{field.dataType}</code></span>
      {field.dataType === "boolean" ? (
        <select value={value} onChange={(event) => onChange(event.target.value)}><option value="">未设置</option><option value="true">true</option><option value="false">false</option></select>
      ) : multiline ? (
        <textarea rows={2} value={value} placeholder={field.dataType === "any" ? "文本或 JSON" : `${field.dataType} JSON`} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input type={field.dataType === "number" ? "number" : "text"} value={value} placeholder={field.defaultValue === undefined ? "输入测试值" : String(field.defaultValue)} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

/** 画布下方的运行控制台：输入、事件轨道和节点 trace 同屏。 */
export function SopRunPanel(props: {
  open: boolean;
  mode: WorkflowRunMode;
  phase: SopRunPhase;
  draft: WorkflowDraft;
  selectedNode: WorkflowNode | null;
  run: WorkflowRunSnapshot | null;
  events: WorkflowRuntimeEvent[];
  versions: SopVersionSummary[];
  message: string;
  onStart: (input: { inputs: Record<string, unknown>; nodeInputs: Record<string, unknown>; targetNodeId?: string; versionId?: string }) => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const workflowInputFields = useMemo(() => workflowFields(props.draft), [props.draft]);
  const nodeInputFields = props.mode === "node-test" ? (props.selectedNode?.ports.inputs ?? []) : [];
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [nodeInputs, setNodeInputs] = useState<Record<string, string>>({});
  const [versionId, setVersionId] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    setInputs({});
    setNodeInputs({});
    setLocalError("");
    setVersionId(props.versions[0]?.id ?? "");
  }, [props.mode, props.selectedNode?.id, props.versions]);

  const traceNodeId = props.selectedNode?.id
    ?? Object.values(props.run?.nodeRuns ?? {}).find((node) => node.status === "failed" || node.status === "running" || node.status === "waiting")?.nodeId
    ?? Object.keys(props.run?.nodeRuns ?? {})[0];
  const trace = traceNodeId ? props.run?.nodeRuns[traceNodeId] : undefined;
  const canStart = (props.phase === "idle" || props.phase === "terminal" || props.phase === "error")
    && (props.mode !== "production" || Boolean(versionId))
    && (props.mode !== "node-test" || Boolean(props.selectedNode));

  if (!props.open) return null;

  const start = () => {
    setLocalError("");
    try {
      if (props.mode === "node-test" && !props.selectedNode) throw new Error("请先在画布中选择一个节点。");
      if (props.mode === "production" && !versionId) throw new Error("请先选择一个已发布版本。");
      props.onStart({
        inputs: collectInputs(workflowInputFields, inputs),
        nodeInputs: collectInputs(nodeInputFields, nodeInputs),
        targetNodeId: props.mode === "node-test" ? props.selectedNode?.id : undefined,
        versionId: props.mode === "production" ? versionId : undefined,
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="sop-run-panel" aria-label="运行控制台">
      <header className="sop-run-head">
        <div className="sop-run-heading">
          <span className="sop-run-live"><Radio aria-hidden="true" /></span>
          <div><strong>{modeLabel(props.mode)}</strong><span>{props.run ? `run ${props.run.id.slice(0, 8)}` : "配置输入后开始运行"}</span></div>
        </div>
        <div className="sop-run-head-actions">
          {props.run ? <span className={`sop-run-status ${props.run.status}`}>{statusLabel[props.run.status] ?? props.run.status}</span> : null}
          {props.run && props.phase === "running" ? <button type="button" className="sop-run-cancel" onClick={props.onCancel}><CircleStop aria-hidden="true" />取消</button> : null}
          <button type="button" className="sop-run-close" aria-label="关闭运行控制台" onClick={props.onClose}><X aria-hidden="true" /></button>
        </div>
      </header>

      <div className="sop-run-grid">
        <div className="sop-run-inputs">
          <div className="sop-run-section-title"><Braces aria-hidden="true" /><span>运行输入</span></div>
          {props.mode === "production" ? (
            <label className="sop-run-field"><span>发布版本<b>*</b><code>immutable</code></span><select value={versionId} onChange={(event) => setVersionId(event.target.value)}>
              <option value="">选择版本</option>
              {props.versions.map((version) => <option key={version.id} value={version.id}>v{version.version} · {version.contentHash.slice(0, 8)}</option>)}
            </select></label>
          ) : null}
          {props.mode === "production" && props.versions.length === 0 ? <div className="sop-run-empty">还没有可运行的发布版本。请先在右上角「发布」中创建不可变版本。</div> : null}
          {workflowInputFields.map((field) => <InputControl key={`workflow-${field.id}`} field={field} value={inputs[field.id] ?? ""} onChange={(value) => setInputs((current) => ({ ...current, [field.id]: value }))} />)}
          {props.mode === "node-test" ? <div className="sop-run-node-input-title"><FlaskConical aria-hidden="true" />{props.selectedNode ? `${props.selectedNode.label} 的节点输入` : "尚未选择节点"}</div> : null}
          {nodeInputFields.map((field) => <InputControl key={`node-${field.id}`} field={field} value={nodeInputs[field.id] ?? ""} onChange={(value) => setNodeInputs((current) => ({ ...current, [field.id]: value }))} />)}
          {workflowInputFields.length === 0 && nodeInputFields.length === 0 && props.mode !== "production" ? <div className="sop-run-empty">当前运行不需要补充输入。</div> : null}
          <button type="button" className="sop-run-start" disabled={!canStart || props.phase === "preparing"} onClick={start}>
            {props.phase === "starting" || props.phase === "preparing" ? <RotateCcw className="spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
            {props.phase === "starting" ? "正在启动" : props.phase === "preparing" ? "读取版本" : props.run ? "重新运行" : "开始运行"}
          </button>
          {localError || props.message ? <div className="sop-run-message">{localError || props.message}</div> : null}
        </div>

        <div className="sop-run-events">
          <div className="sop-run-section-title"><ListTree aria-hidden="true" /><span>执行轨道</span><em>{props.events.length}</em></div>
          {props.events.length === 0 ? <div className="sop-run-empty">运行事件会按顺序出现在这里；断线重连时相同事件不会重复。</div> : null}
          <div className="sop-run-event-list">
            {props.events.map((event) => (
              <button key={event.id} type="button" className={`sop-run-event ${event.type.replace(".", "-")}`}>
                <span className="sop-run-event-id">{String(event.id).padStart(3, "0")}</span>
                <span className="sop-run-event-dot" aria-hidden="true" />
                <span className="sop-run-event-copy"><strong>{event.type}</strong><small>{eventSummary(event)}</small></span>
                <time><Clock3 aria-hidden="true" />{new Date(event.at).toLocaleTimeString("zh-CN", { hour12: false })}</time>
              </button>
            ))}
          </div>
        </div>

        <div className="sop-run-trace">
          <div className="sop-run-section-title"><FlaskConical aria-hidden="true" /><span>节点 Trace</span></div>
          {!trace ? <div className="sop-run-empty">选择画布节点可查看本次输入、输出、日志、耗时与错误。</div> : (
            <>
              <div className="sop-run-trace-title"><strong>{trace.nodeId}</strong><span className={trace.status}>{statusLabel[trace.status] ?? trace.status}</span></div>
              <div className="sop-run-trace-meta"><span>attempt {trace.attempt}</span><span>{trace.durationMs === undefined ? "耗时 —" : `${trace.durationMs} ms`}</span></div>
              <label>输入<pre>{json(trace.input)}</pre></label>
              <label>输出<pre>{json(trace.output)}</pre></label>
              {trace.error ? <div className="sop-run-error"><Ban aria-hidden="true" /><div><strong>{trace.error.code}</strong><span>{trace.error.message}</span><code>node {trace.error.nodeId ?? trace.nodeId} · attempt {trace.error.attempt ?? trace.attempt}</code></div></div> : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
