import type { ComponentType } from "react";
import type { BuiltinNodeType } from "@orbit/workflow-core";
import { StartInspector } from "./start/StartInspector";
import { EndInspector } from "./end/EndInspector";
import { LlmInspector } from "./llm/LlmInspector";
import { ToolInspector } from "./tool/ToolInspector";
import { HttpInspector } from "./http/HttpInspector";
import { CodeInspector } from "./code/CodeInspector";
import { ConditionInspector } from "./condition/ConditionInspector";
import { TemplateInspector } from "./template/TemplateInspector";
import { VariableInspector } from "./variable/VariableInspector";
import { KnowledgeInspector } from "./knowledge/KnowledgeInspector";
import { ParallelInspector } from "./parallel/ParallelInspector";
import { MergeInspector } from "./merge/MergeInspector";
import { IterationInspector } from "./iteration/IterationInspector";
import { LoopInspector } from "./loop/LoopInspector";
import { SubworkflowInspector } from "./subworkflow/SubworkflowInspector";
import { HumanApprovalInspector } from "./human-approval/HumanApprovalInspector";
import { AgentInspector } from "./agent/AgentInspector";
import type { NodeConfigInspectorProps } from "./types";

/** Web inspector 通过稳定 node type 注册，不侵入画布核心。 */
export const nodeInspectorRegistry: Record<BuiltinNodeType, ComponentType<NodeConfigInspectorProps>> = {
  start: StartInspector,
  end: EndInspector,
  llm: LlmInspector,
  tool: ToolInspector,
  http: HttpInspector,
  code: CodeInspector,
  condition: ConditionInspector,
  template: TemplateInspector,
  variable: VariableInspector,
  knowledge: KnowledgeInspector,
  parallel: ParallelInspector,
  merge: MergeInspector,
  iteration: IterationInspector,
  loop: LoopInspector,
  subworkflow: SubworkflowInspector,
  agent: AgentInspector,
  "human-approval": HumanApprovalInspector,
};
