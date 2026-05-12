import { runHooks, type HookEventName, type HookInvocation, type HookRunResult } from "./hooks/index.js";

export type HookServiceLike = {
  run(event: HookEventName, invocation: Omit<HookInvocation, "event" | "cwd">): Promise<HookRunResult>;
};

export class HookService implements HookServiceLike {
  async run(event: HookEventName, invocation: Omit<HookInvocation, "event" | "cwd">): Promise<HookRunResult> {
    return runHooks(event, invocation);
  }
}

export const DEFAULT_HOOK_SERVICE = new HookService();
