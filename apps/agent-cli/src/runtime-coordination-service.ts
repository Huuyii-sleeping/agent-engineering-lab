import { runAutonomyTick } from "./tools/autonomy.js";
import { peekScheduledNotificationCount, tickScheduler } from "./tools/scheduler.js";

export type AutonomyTickResult = {
  ok?: boolean;
  action?: string;
  taskId?: number;
  reason?: string;
  runtime?: Record<string, unknown>;
  error?: {
    code?: string;
    message?: string;
  };
};

export type RuntimeCoordinationServiceLike = {
  runAutonomyTick(): Promise<AutonomyTickResult>;
  tickScheduler(): Promise<void>;
  peekScheduledPromptCount(): Promise<number>;
};

export class RuntimeCoordinationService implements RuntimeCoordinationServiceLike {
  async runAutonomyTick(): Promise<AutonomyTickResult> {
    return JSON.parse(await runAutonomyTick()) as AutonomyTickResult;
  }

  async tickScheduler(): Promise<void> {
    await tickScheduler();
  }

  async peekScheduledPromptCount(): Promise<number> {
    return peekScheduledNotificationCount();
  }
}

export const DEFAULT_RUNTIME_COORDINATION_SERVICE = new RuntimeCoordinationService();
