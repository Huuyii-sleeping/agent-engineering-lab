import {
  loadLatestDeliveryReport,
  runDeliveryReportTool,
  runDeliveryValidateTool,
  runDeliveryValidation,
  type DeliveryReport,
} from "./delivery.js";

export type DeliveryServiceLike = {
  loadLatestReport(): Promise<DeliveryReport | null>;
  runValidation(options?: { mode?: "manual" | "auto"; changedPaths?: string[]; traceId?: string }): Promise<DeliveryReport>;
  runValidateTool(changedPaths?: unknown, mode?: unknown): Promise<string>;
  runReportTool(): Promise<string>;
};

export class DeliveryService implements DeliveryServiceLike {
  async loadLatestReport(): Promise<DeliveryReport | null> {
    return loadLatestDeliveryReport();
  }

  async runValidation(options?: {
    mode?: "manual" | "auto";
    changedPaths?: string[];
    traceId?: string;
  }): Promise<DeliveryReport> {
    return runDeliveryValidation(options);
  }

  async runValidateTool(changedPaths?: unknown, mode?: unknown): Promise<string> {
    return runDeliveryValidateTool(changedPaths, mode);
  }

  async runReportTool(): Promise<string> {
    return runDeliveryReportTool();
  }
}

export const DEFAULT_DELIVERY_SERVICE = new DeliveryService();
