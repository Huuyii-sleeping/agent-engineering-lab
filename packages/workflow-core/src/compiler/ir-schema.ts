import { WORKFLOW_SCHEMA_VERSION } from "../contracts/primitives.js";
import { WORKFLOW_IR_VERSION, type WorkflowIR, type WorkflowIRGraph } from "./contracts.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isWorkflowIRGraph(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges) || !isRecord(value.topology)) return false;
  return value.nodes.every((node) => isRecord(node) && typeof node.id === "string" && typeof node.type === "string" && typeof node.kind === "string")
    && value.edges.every((edge) => isRecord(edge) && typeof edge.id === "string")
    && Array.isArray(value.topology.orderedNodeIds);
}

/** 判断未知输入是否为 Workflow IR v2 envelope。 */
export function isWorkflowIR(value: unknown): value is WorkflowIR {
  if (!isRecord(value)) return false;
  return value.irVersion === WORKFLOW_IR_VERSION
    && value.schemaVersion === WORKFLOW_SCHEMA_VERSION
    && isRecord(value.source)
    && isRecord(value.resourceBudget)
    && Array.isArray(value.dependencies)
    && isWorkflowIRGraph(value);
}
