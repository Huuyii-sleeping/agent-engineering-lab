/** Local display metadata for one chat session in the Web console. */
export type SessionMetadata = {
  title?: string;
  pinned?: boolean;
  hidden?: boolean;
};

/** Local display metadata keyed by session id. */
export type SessionMetadataMap = Record<string, SessionMetadata>;

type MetadataStorage = Pick<Storage, "getItem" | "setItem">;

const STORAGE_KEY = "agent-web-console-session-metadata-v2";

function asMetadataMap(value: unknown): SessionMetadataMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const map: SessionMetadataMap = {};
  for (const [sessionId, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const record = raw as Record<string, unknown>;
    map[sessionId] = {
      title: typeof record.title === "string" && record.title.trim() ? record.title.trim() : undefined,
      pinned: record.pinned === true,
      hidden: record.hidden === true,
    };
  }
  return map;
}

function updateSessionMetadata(
  metadata: SessionMetadataMap,
  sessionId: string,
  updater: (current: SessionMetadata) => SessionMetadata,
): SessionMetadataMap {
  return {
    ...metadata,
    [sessionId]: updater(metadata[sessionId] ?? {}),
  };
}

/** Reads session display metadata from browser storage. */
export function readSessionMetadata(storage: MetadataStorage | null | undefined): SessionMetadataMap {
  if (!storage) {
    return {};
  }
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    return asMetadataMap(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

/** Persists session display metadata to browser storage. */
export function writeSessionMetadata(
  storage: MetadataStorage | null | undefined,
  metadata: SessionMetadataMap,
): void {
  storage?.setItem(STORAGE_KEY, JSON.stringify(metadata));
}

/** Returns the display title for a session, honoring local rename metadata. */
export function sessionDisplayTitle(input: { id: string }, metadata: SessionMetadataMap): string {
  return metadata[input.id]?.title ?? `会话 ${input.id.slice(0, 8)}`;
}

/** Returns true when a session is hidden from the local Web history list. */
export function isSessionHidden(sessionId: string, metadata: SessionMetadataMap): boolean {
  return metadata[sessionId]?.hidden === true;
}

/** Toggles local pinned state for a session. */
export function toggleSessionPinned(metadata: SessionMetadataMap, sessionId: string): SessionMetadataMap {
  return updateSessionMetadata(metadata, sessionId, (current) => ({
    ...current,
    pinned: current.pinned !== true,
  }));
}

/** Stores a local display title for a session. */
export function renameSession(
  metadata: SessionMetadataMap,
  sessionId: string,
  title: string,
): SessionMetadataMap {
  const trimmed = title.trim();
  return updateSessionMetadata(metadata, sessionId, (current) => ({
    ...current,
    title: trimmed || current.title,
  }));
}

/** Hides a session from the local Web history list. */
export function hideSession(metadata: SessionMetadataMap, sessionId: string): SessionMetadataMap {
  return updateSessionMetadata(metadata, sessionId, (current) => ({
    ...current,
    hidden: true,
  }));
}
