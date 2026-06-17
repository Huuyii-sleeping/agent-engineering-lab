/** Minimal session identity needed to keep the active chat in sync with the visible history list. */
export type SelectableSession = {
  id: string;
};

/** Resolves the active session id against the currently visible, already ordered session list. */
export function resolveActiveSessionId(
  activeSessionId: string | null,
  visibleSessions: Iterable<SelectableSession>,
): string | null {
  const orderedSessions = [...visibleSessions];
  if (activeSessionId && orderedSessions.some((session) => session.id === activeSessionId)) {
    return activeSessionId;
  }
  return orderedSessions[0]?.id ?? null;
}
