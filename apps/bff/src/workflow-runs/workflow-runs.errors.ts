/** workflow-runs 控制面可直接映射为 HTTP 的领域错误。 */
export class WorkflowRunControlError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly metadata: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "WorkflowRunControlError";
  }
}
