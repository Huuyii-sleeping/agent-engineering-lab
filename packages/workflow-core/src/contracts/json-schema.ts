/** workflow-core 持久化、发布和运行校验共用的最小 JSON Schema 契约。 */
export type WorkflowJsonSchema = {
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, WorkflowJsonSchema>;
  required?: string[];
  items?: WorkflowJsonSchema;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  additionalProperties?: boolean | WorkflowJsonSchema;
};
