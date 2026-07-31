export type AgentBridgeCapabilities = {
  chat: boolean;
  sessions: boolean;
  tools: boolean;
  events: boolean;
  bridgeState: boolean;
  eventReplay: boolean;
};

export type AgentBridgeEndpoints = {
  health: string;
  bridge: string;
  bridgeState: string;
  chat: string;
  tools: string;
  toolCall: string;
  sessions: string;
  sessionDetail: string;
  events: string;
};

export type AgentBridgeManifest = {
  ok: true;
  name: string;
  version: string;
  capabilities: AgentBridgeCapabilities;
  endpoints: AgentBridgeEndpoints;
};

export type AgentBridgeState = {
  ok: true;
  ready: boolean;
  name: string;
  version: string;
  capabilities: AgentBridgeCapabilities;
  session_count: number;
  sessions: Array<Record<string, unknown>>;
  latest_event_id: number | null;
  oldest_event_id: number | null;
  buffered_event_count: number;
};

export function createAgentBridgeManifest(): AgentBridgeManifest {
  return {
    ok: true,
    name: "agent-cli-bridge",
    version: "0.1.0",
    capabilities: {
      chat: true,
      sessions: true,
      tools: true,
      events: true,
      bridgeState: true,
      eventReplay: true,
    },
    endpoints: {
      health: "/health",
      bridge: "/bridge",
      bridgeState: "/bridge/state",
      chat: "/chat",
      tools: "/tools",
      toolCall: "/tools/call",
      sessions: "/sessions",
      sessionDetail: "/sessions/:id",
      events: "/events",
    },
  };
}
