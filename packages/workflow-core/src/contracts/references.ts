import type { AgentOutputSchema } from "./nodes.js";
import type { WorkflowVersion } from "./workflow.js";

/** 发布编译阶段解析不可变 WorkflowVersion 的只读端口。 */
export type WorkflowVersionResolver = {
  resolvePublishedVersion(workflowId: string, versionId: string): WorkflowVersion | undefined;
};

/** AgentVersion 中固定的 Skill 安装来源与版本。 */
export type AgentVersionSkillBinding = {
  skillId: string;
  version: string;
  sourceType: "builtin" | "remote" | "custom";
  registrySource: "official" | "verified" | "community" | "private" | "local";
};

/** 从可变 AgentProfile 发布的不可变产品版本。 */
export type AgentVersion = {
  id: string;
  agentProfileId: string;
  version: number;
  contentHash: string;
  name: string;
  description: string;
  instructions: string[];
  toolPolicy: { allowedToolIds: string[] };
  skillPolicy: { bindings: AgentVersionSkillBinding[] };
  outputSchema: AgentOutputSchema;
  createdBy: string;
  releaseNotes: string;
  createdAt: number;
};

/** 发布编译阶段解析固定 Agent profile/version 的只读端口。 */
export type AgentVersionResolver = {
  resolvePublishedVersion(agentProfileId: string, agentVersionId: string): AgentVersion | undefined;
};

/** 发布编译阶段验证 Human Approval policy 的只读端口。 */
export type ApprovalPolicyResolver = {
  hasPolicy(policyId: string): boolean;
};

/** workflow-core 所需的产品引用目录；实现由产品服务层注入。 */
export type WorkflowReferenceResolvers = {
  workflowVersions?: WorkflowVersionResolver;
  agentVersions?: AgentVersionResolver;
  approvalPolicies?: ApprovalPolicyResolver;
};
