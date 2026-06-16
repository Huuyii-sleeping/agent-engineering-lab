export function shouldReloadSessionFromAgentEvent(input: {
  activeSessionId: string | null;
  streamingSessionId: string | null;
}): boolean {
  return Boolean(
    input.activeSessionId &&
      input.streamingSessionId !== input.activeSessionId,
  );
}
