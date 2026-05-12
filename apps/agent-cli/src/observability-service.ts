import {
  createSpanId,
  createTraceId,
  recordObservabilityEvent,
  withExecutionContext,
  type ExecutionContext,
  type ObservabilityEvent,
} from "./observability/runtime.js";

export type ObservabilityServiceLike = {
  createTraceId(): string;
  createSpanId(): string;
  withExecutionContext<T>(context: ExecutionContext, fn: () => Promise<T>): Promise<T>;
  recordEvent(
    kind: string,
    payload: Record<string, unknown>,
    context?: Partial<ExecutionContext>,
  ): Promise<ObservabilityEvent>;
};

export class ObservabilityService implements ObservabilityServiceLike {
  createTraceId(): string {
    return createTraceId();
  }

  createSpanId(): string {
    return createSpanId();
  }

  async withExecutionContext<T>(context: ExecutionContext, fn: () => Promise<T>): Promise<T> {
    return withExecutionContext(context, fn);
  }

  async recordEvent(
    kind: string,
    payload: Record<string, unknown>,
    context?: Partial<ExecutionContext>,
  ): Promise<ObservabilityEvent> {
    return recordObservabilityEvent(kind, payload, context);
  }
}

export const DEFAULT_OBSERVABILITY_SERVICE = new ObservabilityService();
