import { agentAvatarOptionFor } from "../lib/agent-avatar";

/** Render the built-in avatar selected for an agent profile. */
export function AgentAvatar({ avatarId, label }: { avatarId: string; label: string }) {
  const option = agentAvatarOptionFor(avatarId);
  const Icon = option.icon;
  return (
    <span className={`agent-avatar agent-avatar--${option.id}`} aria-label={`${label} 头像`} role="img">
      <Icon size={19} strokeWidth={2.4} aria-hidden="true" />
    </span>
  );
}
