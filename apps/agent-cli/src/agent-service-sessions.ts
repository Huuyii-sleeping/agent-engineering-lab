import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { randomUUID } from "node:crypto";
import { createAgentRuntimeState } from "./bootstrap/app-runtime.js";
import type { AgentRuntimeState } from "./runtime/query-types.js";

export type AgentSessionRecord = {
  id: string;
  createdAt: number;
  updatedAt: number;
  busy: boolean;
  history: ChatCompletionMessageParam[];
  runtimeState: AgentRuntimeState;
};

export function nowMs(): number {
  return Date.now();
}

export function createAgentSessionRecord(id = randomUUID(), timestamp = nowMs()): AgentSessionRecord {
  return {
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    busy: false,
    history: [],
    runtimeState: createAgentRuntimeState(id),
  };
}

export function sortSessionsByCreatedAt(
  sessions: Iterable<AgentSessionRecord>,
): AgentSessionRecord[] {
  return [...sessions].sort((a, b) => a.createdAt - b.createdAt);
}

export function summarizeSession(session: AgentSessionRecord): Record<string, unknown> {
  return {
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    busy: session.busy,
    messageCount: session.history.length,
    rounds: session.runtimeState.roundCounter,
  };
}

export function summarizeSessionTranscript(session: AgentSessionRecord): Record<string, unknown> {
  return {
    ...summarizeSession(session),
    messages: session.history,
  };
}
