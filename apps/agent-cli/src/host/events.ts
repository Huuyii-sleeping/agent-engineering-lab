export type AgentHostEvent = {
  id: number;
  at: number;
  type: "session.created" | "chat.started" | "chat.completed" | "chat.failed";
  payload: Record<string, unknown>;
};

export type AgentHostEventSubscriber = (event: AgentHostEvent) => void;
