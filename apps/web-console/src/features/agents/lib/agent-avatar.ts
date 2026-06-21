import { Bot, BrainCircuit, Code2, Compass, type LucideIcon } from "lucide-react";

/** Built-in avatar ids currently available for agent profiles. */
export type AgentAvatarId = "brain" | "bot" | "code" | "compass";

/** Display metadata for one built-in agent avatar option. */
export type AgentAvatarOption = {
  id: AgentAvatarId;
  label: string;
  icon: LucideIcon;
};

export const defaultAgentAvatarId: AgentAvatarId = "brain";

export const agentAvatarOptions: AgentAvatarOption[] = [
  { id: "brain", label: "思考", icon: BrainCircuit },
  { id: "bot", label: "助手", icon: Bot },
  { id: "code", label: "代码", icon: Code2 },
  { id: "compass", label: "规划", icon: Compass },
];

/** Return a supported built-in avatar id, falling back to the default avatar. */
export function normalizeAgentAvatarId(value: unknown): AgentAvatarId {
  return agentAvatarOptions.some((option) => option.id === value) ? (value as AgentAvatarId) : defaultAgentAvatarId;
}

/** Return the display metadata for a built-in agent avatar. */
export function agentAvatarOptionFor(avatarId: string): AgentAvatarOption {
  return agentAvatarOptions.find((option) => option.id === avatarId) ?? agentAvatarOptions[0];
}
