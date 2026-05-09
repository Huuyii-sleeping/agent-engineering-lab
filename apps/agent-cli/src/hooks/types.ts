export type HookEventName = "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "Stop";

export type HookMatcher = {
  tools?: string[];
};

export type CommandHookDefinition = {
  type: "command";
  command: string;
  args?: string[];
  matcher?: HookMatcher;
};

export type HooksFile = {
  hooks?: Partial<Record<HookEventName, CommandHookDefinition[]>>;
};

export type HookInvocation = {
  event: HookEventName;
  session_id: string;
  trace_id?: string;
  span_id?: string;
  cwd: string;
  payload: Record<string, unknown>;
};

export type HookDecision =
  | { action: "continue" }
  | { action: "block"; reason: string }
  | { action: "append_message"; message?: string; messages?: string[] };

export type HookRunResult = {
  blocked: boolean;
  blockReason: string | null;
  messages: string[];
  matched: number;
  executed: number;
  errors: string[];
};
