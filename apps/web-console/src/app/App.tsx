import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  readDownloadedSkillIds,
  readAgentBuilderConfig,
  toggleAgentBuilderId,
  writeDownloadedSkillIds,
  writeAgentBuilderConfig,
  type AgentBuilderConfig,
} from "../agent-builder";
import {
  createAgentProfile,
  createAgentEventStream,
  createSession,
  deleteAgentProfile,
  fetchAgents,
  fetchHealth,
  fetchProfile,
  fetchSession,
  fetchSessions,
  updateAgentProfile,
  sendSessionMessageStream,
  updateProfile,
  defaultAgentProfileInput,
  defaultUserProfile,
  type AgentProfile,
  type AgentProfileInput,
  type ChatMessage,
  type HealthStatus,
  type SessionDetail,
  type SessionSummary,
  type UserProfile,
} from "../api";
import { shouldReloadSessionFromAgentEvent } from "../chat-stream-state";
import {
  hideSession,
  hideSessions,
  isSessionHidden,
  readSessionMetadata,
  renameSession,
  sessionDisplayTitle,
  summarizeSessionTitle,
  toggleSessionPinned,
  writeSessionMetadata,
  type SessionMetadataMap,
} from "../session-metadata";
import { resolveActiveSessionId } from "../session-selection";
import { settingsSectionFromHash, type SettingsSection } from "../settings-route";
import { getNextTheme, readStoredTheme, writeStoredTheme, type ThemeMode } from "../theme";
import { AppSidebar } from "../components/layout/AppSidebar";
import { ChatWorkspace } from "../components/layout/ChatWorkspace";
import type { AppView, LoadState, SessionSummaryTitleMap, StreamState } from "./types";
import { agentDraftFromProfile } from "../features/agents/lib/agent-profile";
import {
  sortSessionsByRecent,
  sortSessionsForSidebar,
} from "../features/chat/lib/chat-format";
import { AgentManagerPage } from "../features/agents/pages/AgentManagerPage";
import { AgentBuilderPage } from "../features/agents/pages/AgentBuilderPage";
import { AgentWorkspaceTree } from "../features/agents/components/AgentWorkspaceTree";
import { LandingPage } from "../pages/LandingPage";
import { SettingsPage } from "../pages/SettingsPage";
import { SkillHubPage } from "../features/skills/pages/SkillHubPage";

export function App() {
  const initialSettingsSection = typeof window === "undefined" ? null : settingsSectionFromHash(window.location.hash);
  const [theme, setTheme] = useState<ThemeMode>(() =>
    typeof window === "undefined" ? "dark" : readStoredTheme(window.localStorage),
  );
  const [view, setView] = useState<AppView>(initialSettingsSection ? "settings" : "landing");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(initialSettingsSection ?? "profile");
  const [builderConfig, setBuilderConfig] = useState<AgentBuilderConfig>(() =>
    typeof window === "undefined" ? readAgentBuilderConfig(null) : readAgentBuilderConfig(window.localStorage),
  );
  const [downloadedSkillIds, setDownloadedSkillIds] = useState<string[]>(() =>
    typeof window === "undefined" ? readDownloadedSkillIds(null) : readDownloadedSkillIds(window.localStorage),
  );
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [agentDraft, setAgentDraft] = useState<AgentProfileInput>(defaultAgentProfileInput);
  const [isNewAgentDraft, setIsNewAgentDraft] = useState(false);
  const [agentSaving, setAgentSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(defaultUserProfile);
  const [profileDraft, setProfileDraft] = useState<UserProfile>(profile);
  const [editingProfile, setEditingProfile] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<SessionDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [streamState, setStreamState] = useState<StreamState>("connecting");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [openSessionMenuId, setOpenSessionMenuId] = useState<string | null>(null);
  const [isSessionBatchMode, setIsSessionBatchMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(() => new Set());
  const [sessionSummaryTitles, setSessionSummaryTitles] = useState<SessionSummaryTitleMap>({});
  const [sessionMetadata, setSessionMetadata] = useState<SessionMetadataMap>(() =>
    typeof window === "undefined" ? {} : readSessionMetadata(window.localStorage),
  );
  const [error, setError] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const streamingSessionIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeSummary = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );
  const activeAgent = useMemo(() => agents.find((agent) => agent.id === activeAgentId) ?? null, [activeAgentId, agents]);
  const visibleSessions = useMemo(
    () => sortSessionsForSidebar(sessions, sessionMetadata).filter((session) => !isSessionHidden(session.id, sessionMetadata)),
    [sessionMetadata, sessions],
  );
  const selectedSessionCount = selectedSessionIds.size;
  const areAllVisibleSessionsSelected =
    visibleSessions.length > 0 && visibleSessions.every((session) => selectedSessionIds.has(session.id));
  const isBusy = loadState === "sending" || activeSummary?.busy === true;
  const canSend = Boolean(activeSessionId && draft.trim() && !isBusy);
  const messages = activeSession?.messages ?? [];
  const activeSessionSummaryTitle = activeSession ? summarizeSessionTitle(activeSession.messages) : null;
  const isSettingsView = view === "settings";
  const isAgentManagerView = view === "agents";
  const isAgentConfigView = view === "agent-config";
  const isAgentSurfaceView = isAgentManagerView || isAgentConfigView;
  const isAgentWorkspaceView = isAgentSurfaceView || view === "skills" || view === "builder";
  const isBuilderView = view === "builder";
  const isLandingView = view === "landing";
  const conversationRuntimeState = loadState === "loading" ? "loading" : isBusy ? "running" : activeSessionId ? "completed" : "idle";

  function sessionTitleFor(session: SessionSummary | SessionDetail): string {
    const generatedTitle =
      activeSession?.id === session.id ? activeSessionSummaryTitle : sessionSummaryTitles[session.id] ?? null;
    return sessionDisplayTitle(session, sessionMetadata, generatedTitle);
  }

  async function refreshHealth(): Promise<void> {
    try {
      setHealth(await fetchHealth());
    } catch (err) {
      setHealth({ ok: false, connected: false, bffStatus: "error", agentStatus: "unavailable" });
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function refreshSessions(selectFirst = false): Promise<void> {
    const next = sortSessionsByRecent(await fetchSessions());
    setSessions(next);
    const nextVisibleSessions = sortSessionsForSidebar(next, sessionMetadata).filter(
      (session) => !isSessionHidden(session.id, sessionMetadata),
    );
    const nextActiveSessionId = resolveActiveSessionId(activeSessionId, nextVisibleSessions);
    if (selectFirst && !activeSessionId && nextActiveSessionId) {
      setActiveSessionId(nextActiveSessionId);
    }
  }

  async function refreshProfile(): Promise<void> {
    const nextProfile = await fetchProfile();
    setProfile(nextProfile);
    setProfileDraft(nextProfile);
  }

  async function refreshAgents(selectFirst = false): Promise<AgentProfile[]> {
    const nextAgents = await fetchAgents();
    setAgents(nextAgents);
    const nextActiveAgent = nextAgents.find((agent) => agent.id === activeAgentId) ?? (selectFirst ? nextAgents[0] ?? null : null);
    if (nextActiveAgent) {
      setActiveAgentId(nextActiveAgent.id);
      setAgentDraft(agentDraftFromProfile(nextActiveAgent));
      setIsNewAgentDraft(false);
    } else if (nextAgents.length === 0) {
      setActiveAgentId(null);
      setAgentDraft(defaultAgentProfileInput);
      setIsNewAgentDraft(false);
    }
    return nextAgents;
  }

  async function refreshAgentsSafely(selectFirst = false): Promise<void> {
    try {
      await refreshAgents(selectFirst);
      setAgentError(null);
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loadSession(sessionId: string, options: { silent?: boolean } = {}): Promise<void> {
    if (!options.silent) {
      setLoadState("loading");
    }
    try {
      const detail = await fetchSession(sessionId);
      const generatedTitle = summarizeSessionTitle(detail.messages);
      setActiveSession(detail);
      if (generatedTitle) {
        setSessionSummaryTitles((current) => ({ ...current, [detail.id]: generatedTitle }));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!options.silent) {
        setLoadState("idle");
      }
    }
  }

  async function bootstrap(): Promise<void> {
    setLoadState("loading");
    const profileResult = refreshProfile();
    const agentResult = refreshAgentsSafely(true);
    const runtimeResultsPromise = Promise.allSettled([refreshHealth(), refreshSessions(true)]);
    const businessResultsPromise = Promise.allSettled([profileResult, agentResult]);
    const [runtimeResults, businessResults] = await Promise.all([runtimeResultsPromise, businessResultsPromise]);
    const failedRuntime = runtimeResults.find((result) => result.status === "rejected");
    const failedBusiness = businessResults.find((result) => result.status === "rejected");

    if (failedRuntime?.status === "rejected") {
      setError(failedRuntime.reason instanceof Error ? failedRuntime.reason.message : String(failedRuntime.reason));
    } else if (failedBusiness?.status === "rejected") {
      setError(failedBusiness.reason instanceof Error ? failedBusiness.reason.message : String(failedBusiness.reason));
    } else {
      setError(null);
    }
    setLoadState("idle");
  }

  async function handleCreateSession(): Promise<void> {
    exitSessionBatchMode();
    setView("chat");
    setLoadState("loading");
    try {
      const session = await createSession();
      await refreshSessions();
      setActiveSessionId(session.id);
      setActiveSession({ ...session, messages: [] });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadState("idle");
    }
  }

  async function sendDraft(): Promise<void> {
    if (!activeSessionId || !draft.trim() || isBusy) {
      return;
    }
    const message = draft.trim();
    const targetSessionId = activeSessionId;
    setDraft("");
    setLoadState("sending");
    streamingSessionIdRef.current = targetSessionId;
    setActiveSession((session) =>
      session
        ? {
            ...session,
            messages: [...session.messages, { role: "user", content: message }, { role: "assistant", content: "", name: "streaming" }],
          }
        : session,
    );
    try {
      await sendSessionMessageStream(activeSessionId, message, (event) => {
        if (event.type === "message.delta") {
          const delta = event.data.delta ?? "";
          if (!delta) {
            return;
          }
          setActiveSession((session) =>
            session
              ? {
                  ...session,
                  messages: session.messages.map((item, index) =>
                    index === session.messages.length - 1 && item.role === "assistant"
                      ? { role: "assistant", content: `${item.content ?? ""}${delta}` }
                      : item,
                  ),
                }
              : session,
          );
        }
        if (event.type === "message.done" && event.data.assistant) {
          const assistant = event.data.assistant;
          setActiveSession((session) =>
            session
              ? {
                  ...session,
                  messages: session.messages.map((item, index) =>
                    index === session.messages.length - 1 && item.role === "assistant"
                      ? { role: "assistant", content: assistant }
                      : item,
                  ),
                }
              : session,
          );
        }
        if (event.type === "message.error") {
          throw new Error(event.data.message ?? "message stream failed");
        }
      });
      await Promise.all([refreshSessions(), loadSession(activeSessionId)]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (streamingSessionIdRef.current === targetSessionId) {
        streamingSessionIdRef.current = null;
      }
      setLoadState("idle");
    }
  }

  async function handleSend(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await sendDraft();
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void sendDraft();
      return;
    }
    if (event.key === "Escape") {
      event.currentTarget.blur();
    }
  }

  function handleThemeToggle(): void {
    setTheme((current) => {
      const next = getNextTheme(current);
      writeStoredTheme(window.localStorage, next);
      return next;
    });
  }

  function openSettings(section: SettingsSection): void {
    setSettingsSection(section);
    setView("settings");
    window.location.hash = `settings/${section}`;
  }

  function backToChat(): void {
    setView("chat");
    if (window.location.hash.startsWith("#settings")) {
      window.history.pushState("", document.title, window.location.pathname + window.location.search);
    }
  }

  function updateBuilderConfig(config: AgentBuilderConfig): void {
    setBuilderConfig(config);
    writeAgentBuilderConfig(window.localStorage, config);
  }

  function toggleDownloadedSkill(skillId: string): void {
    setDownloadedSkillIds((current) => {
      const next = toggleAgentBuilderId(
        current,
        skillId,
        agentSkillCatalog.map((skill) => skill.id),
      );
      writeDownloadedSkillIds(window.localStorage, next);
      return next;
    });
  }

  function toggleProfileEdit(): void {
    setProfileDraft(profile);
    setEditingProfile((current) => !current);
  }

  function cancelProfileEdit(): void {
    setProfileDraft(profile);
    setEditingProfile(false);
  }

  async function saveProfile(): Promise<void> {
    try {
      const nextProfile = await updateProfile(profileDraft);
      setProfile(nextProfile);
      setProfileDraft(nextProfile);
      setEditingProfile(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function selectAgent(agent: AgentProfile): void {
    setActiveAgentId(agent.id);
    setAgentDraft(agentDraftFromProfile(agent));
    setIsNewAgentDraft(false);
  }

  function openAgentConfig(agent: AgentProfile): void {
    selectAgent(agent);
    setView("agent-config");
  }

  function handleCreateAgent(): void {
    setActiveAgentId(null);
    setAgentDraft({
      ...defaultAgentProfileInput,
      name: `新 Agent ${agents.length + 1}`,
    });
    setIsNewAgentDraft(true);
    setView("agent-config");
    setAgentError(null);
  }

  async function handleSaveAgent(): Promise<void> {
    if (!activeAgent && !isNewAgentDraft) {
      return;
    }
    setAgentSaving(true);
    try {
      const agent = activeAgent
        ? await updateAgentProfile(activeAgent.id, agentDraft)
        : await createAgentProfile(agentDraft);
      setAgents((current) =>
        activeAgent ? current.map((item) => (item.id === agent.id ? agent : item)) : [agent, ...current],
      );
      setActiveAgentId(agent.id);
      setAgentDraft(agentDraftFromProfile(agent));
      setIsNewAgentDraft(false);
      setView("agent-config");
      setAgentError(null);
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : String(err));
    } finally {
      setAgentSaving(false);
    }
  }

  async function handleDeleteAgent(agent: AgentProfile): Promise<void> {
    setAgentSaving(true);
    try {
      await deleteAgentProfile(agent.id);
      const nextAgents = agents.filter((item) => item.id !== agent.id);
      setAgents(nextAgents);
      const nextAgent = nextAgents[0] ?? null;
      setActiveAgentId(nextAgent?.id ?? null);
      setAgentDraft(nextAgent ? agentDraftFromProfile(nextAgent) : defaultAgentProfileInput);
      setIsNewAgentDraft(false);
      setView("agents");
      setAgentError(null);
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : String(err));
    } finally {
      setAgentSaving(false);
    }
  }

  function discardAgentDraft(): void {
    const nextAgent = activeAgent ?? agents[0] ?? null;
    setActiveAgentId(nextAgent?.id ?? null);
    setAgentDraft(nextAgent ? agentDraftFromProfile(nextAgent) : defaultAgentProfileInput);
    setIsNewAgentDraft(false);
    setAgentError(null);
    setView("agents");
  }

  function handleTestAgent(agent: AgentProfile): void {
    setActiveAgentId(agent.id);
    setView("chat");
  }

  function updateMetadata(updater: (current: SessionMetadataMap) => SessionMetadataMap): void {
    setSessionMetadata((current) => {
      const next = updater(current);
      writeSessionMetadata(window.localStorage, next);
      return next;
    });
  }

  function exitSessionBatchMode(): void {
    setIsSessionBatchMode(false);
    setSelectedSessionIds(new Set());
  }

  function toggleSessionBatchMode(): void {
    setOpenSessionMenuId(null);
    if (isSessionBatchMode) {
      exitSessionBatchMode();
      return;
    }
    setIsSessionBatchMode(true);
  }

  function toggleSessionSelection(sessionId: string): void {
    setSelectedSessionIds((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }

  function selectAllVisibleSessions(): void {
    setSelectedSessionIds(new Set(visibleSessions.map((session) => session.id)));
  }

  function clearSelectedSessions(): void {
    setSelectedSessionIds(new Set());
  }

  function handleBatchHideSessions(): void {
    if (selectedSessionIds.size === 0) {
      return;
    }
    const hiddenIds = new Set(selectedSessionIds);
    updateMetadata((current) => hideSessions(current, hiddenIds));
    if (activeSessionId && hiddenIds.has(activeSessionId)) {
      const nextSession = visibleSessions.find((item) => !hiddenIds.has(item.id)) ?? null;
      setActiveSessionId(nextSession?.id ?? null);
      setActiveSession(null);
    }
    exitSessionBatchMode();
  }

  function handleRenameSession(session: SessionSummary): void {
    setOpenSessionMenuId(null);
    const currentTitle = sessionTitleFor(session);
    const nextTitle = window.prompt("重命名会话", currentTitle);
    if (nextTitle === null) {
      return;
    }
    updateMetadata((current) => renameSession(current, session.id, nextTitle));
  }

  function handleTogglePinned(session: SessionSummary): void {
    setOpenSessionMenuId(null);
    updateMetadata((current) => toggleSessionPinned(current, session.id));
  }

  function handleHideSession(session: SessionSummary): void {
    setOpenSessionMenuId(null);
    updateMetadata((current) => hideSession(current, session.id));
    if (activeSessionId === session.id) {
      const nextSession = visibleSessions.find((item) => item.id !== session.id) ?? null;
      setActiveSessionId(nextSession?.id ?? null);
      setActiveSession(null);
    }
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    function handleHashChange(): void {
      const nextSection = settingsSectionFromHash(window.location.hash);
      if (nextSection) {
        setSettingsSection(nextSection);
        setView("settings");
        return;
      }
      setView((current) => (current === "settings" ? "chat" : current));
    }
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    setStreamState("connecting");
    try {
      const stream = createAgentEventStream({
        onOpen: () => setStreamState("connected"),
        onError: () => setStreamState("disconnected"),
        onEvent: () => {
          void refreshSessions();
          const currentSessionId = activeSessionIdRef.current;
          if (
            shouldReloadSessionFromAgentEvent({
              activeSessionId: currentSessionId,
              streamingSessionId: streamingSessionIdRef.current,
            })
          ) {
            void loadSession(currentSessionId, { silent: true });
          }
        },
      });
      return () => stream.close();
    } catch {
      setStreamState("disconnected");
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      void loadSession(activeSessionId);
    }
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }
    const nextActiveSessionId = resolveActiveSessionId(activeSessionId, visibleSessions);
    if (nextActiveSessionId === activeSessionId) {
      return;
    }
    setActiveSessionId(nextActiveSessionId);
    setActiveSession(null);
  }, [activeSessionId, visibleSessions]);

  useEffect(() => {
    const sessionsNeedingTitle = sessions.filter(
      (session) =>
        session.messageCount > 0 &&
        !sessionMetadata[session.id]?.title &&
        !sessionSummaryTitles[session.id] &&
        activeSession?.id !== session.id,
    );
    if (sessionsNeedingTitle.length === 0) {
      return undefined;
    }
    let cancelled = false;
    void Promise.all(
      sessionsNeedingTitle.map(async (session) => {
        try {
          const detail = await fetchSession(session.id);
          const title = summarizeSessionTitle(detail.messages);
          return title ? [session.id, title] : null;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) {
        return;
      }
      const nextEntries = entries.filter((entry): entry is [string, string] => Boolean(entry));
      if (nextEntries.length === 0) {
        return;
      }
      setSessionSummaryTitles((current) => ({ ...current, ...Object.fromEntries(nextEntries) }));
    });
    return () => {
      cancelled = true;
    };
  }, [activeSession?.id, sessionMetadata, sessionSummaryTitles, sessions]);

  useEffect(() => {
    if (visibleSessions.length === 0) {
      exitSessionBatchMode();
      return;
    }
    const visibleSessionIds = new Set(visibleSessions.map((session) => session.id));
    setSelectedSessionIds((current) => {
      const next = new Set([...current].filter((sessionId) => visibleSessionIds.has(sessionId)));
      return next.size === current.size ? current : next;
    });
  }, [visibleSessions]);

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        textareaRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  if (isLandingView) {
    return <LandingPage onStart={() => setView("agents")} />;
  }

  return (
    <div className={`app-shell ${isSidebarCollapsed ? "app-shell--sidebar-collapsed" : ""} ${isSettingsView || isAgentWorkspaceView ? "app-shell--settings" : ""}`}>
      {!isSettingsView && !isAgentWorkspaceView ? (
        <AppSidebar
          activeSessionId={activeSessionId}
          areAllVisibleSessionsSelected={areAllVisibleSessionsSelected}
          isCollapsed={isSidebarCollapsed}
          isSessionBatchMode={isSessionBatchMode}
          openSessionMenuId={openSessionMenuId}
          selectedSessionCount={selectedSessionCount}
          selectedSessionIds={selectedSessionIds}
          sessionMetadata={sessionMetadata}
          visibleSessions={visibleSessions}
          onBatchHideSessions={handleBatchHideSessions}
          onClearSelectedSessions={clearSelectedSessions}
          onCreateSession={() => void handleCreateSession()}
          onHideSession={handleHideSession}
          onOpenSettings={openSettings}
          onRenameSession={handleRenameSession}
          onSelectAllVisibleSessions={selectAllVisibleSessions}
          onSelectSession={(sessionId) => {
            setView("chat");
            setActiveSessionId(sessionId);
          }}
          onToggleBatchMode={toggleSessionBatchMode}
          onTogglePinned={handleTogglePinned}
          onToggleSessionMenu={(sessionId) => setOpenSessionMenuId((current) => (current === sessionId ? null : sessionId))}
          onToggleSessionSelection={toggleSessionSelection}
          sessionTitleFor={sessionTitleFor}
        />
      ) : null}

      {isSettingsView ? (
        <SettingsPage
          activeSection={settingsSection}
          health={health}
          sessionCount={sessions.length}
          streamState={streamState}
          theme={theme}
          editingProfile={editingProfile}
          profile={profile}
          profileDraft={profileDraft}
          onBack={backToChat}
          onCancelProfileEdit={cancelProfileEdit}
          onProfileDraftChange={setProfileDraft}
          onSaveProfile={() => void saveProfile()}
          onSectionChange={setSettingsSection}
          onToggleProfileEdit={toggleProfileEdit}
          onThemeToggle={handleThemeToggle}
        />
      ) : isAgentWorkspaceView ? (
        <main className="agent-workspace-shell">
          <AgentWorkspaceTree
            activeAgentId={activeAgentId}
            activeView={view}
            agents={agents}
            downloadedSkillCount={downloadedSkillIds.length}
            saving={agentSaving}
            onCreateAgent={() => void handleCreateAgent()}
            onOpenAgent={openAgentConfig}
            onOpenBuilder={() => setView("builder")}
            onOpenChat={() => setView("chat")}
            onOpenDrafts={discardAgentDraft}
            onOpenSkillHub={() => setView("skills")}
            onRefreshAgents={() => void refreshAgentsSafely(true)}
          />
          <section className="agent-workspace-content" aria-label="Agent 工作台内容">
            {isAgentSurfaceView ? (
              <AgentManagerPage
                agents={agents}
                activeAgent={activeAgent}
                draft={agentDraft}
                error={agentError}
                isNewDraft={isNewAgentDraft}
                loading={loadState === "loading"}
                saving={agentSaving}
                mode={isAgentConfigView ? "config" : "drafts"}
                onBackToDrafts={discardAgentDraft}
                onCreateAgent={() => void handleCreateAgent()}
                onDeleteAgent={(agent) => void handleDeleteAgent(agent)}
                onDiscardDraft={discardAgentDraft}
                onDraftChange={setAgentDraft}
                onOpenAgent={openAgentConfig}
                onRefresh={() => void refreshAgentsSafely(true)}
                onSaveAgent={() => void handleSaveAgent()}
                onTestAgent={handleTestAgent}
              />
            ) : isBuilderView ? (
              <AgentBuilderPage config={builderConfig} onConfigChange={updateBuilderConfig} />
            ) : (
              <SkillHubPage downloadedSkillIds={downloadedSkillIds} onToggleSkill={toggleDownloadedSkill} />
            )}
          </section>
        </main>
      ) : (
        <ChatWorkspace
          activeAgent={activeAgent}
          activeSession={activeSession}
          activeSessionId={activeSessionId}
          canSend={canSend}
          conversationRuntimeState={conversationRuntimeState}
          draft={draft}
          error={error}
          isBusy={isBusy}
          isSidebarCollapsed={isSidebarCollapsed}
          messages={messages}
          streamState={streamState}
          textareaRef={textareaRef}
          onBackToAgent={() => setView(activeAgent ? "agent-config" : "agents")}
          onBootstrap={() => void bootstrap()}
          onComposerKeyDown={handleComposerKeyDown}
          onCreateSession={() => void handleCreateSession()}
          onDraftChange={setDraft}
          onSend={(event) => void handleSend(event)}
          onToggleSidebar={() => setIsSidebarCollapsed((current) => !current)}
          sessionTitleFor={sessionTitleFor}
        />
      )}
    </div>
  );
}
