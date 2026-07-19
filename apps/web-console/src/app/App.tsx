import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  agentSkillCatalog,
  readAgentBuilderConfig,
  writeAgentBuilderConfig,
  type AgentBuilderConfig,
} from "../agent-builder";
import {
  createAgentProfile,
  createAgentEventStream,
  createSession,
  deleteAgentProfile,
  downloadSkill,
  fetchAgents,
  fetchHealth,
  fetchProfile,
  fetchSkillHubReadiness,
  fetchSkillAuditEvents,
  fetchSkills,
  fetchSession,
  fetchSessions,
  installSkill,
  updateSkill,
  updateAgentProfile,
  resolveAgentSkills,
  sendSessionMessageStream,
  syncSkillRegistry,
  uninstallSkill,
  updateProfile,
  uploadSkillPackage,
  defaultAgentProfileInput,
  defaultUserProfile,
  type AgentProfile,
  type AgentProfileInput,
  type AgentRuntimeContext,
  type AgentSkillPreflightResult,
  type ChatMessage,
  type HealthStatus,
  type SessionDetail,
  type SessionSummary,
  type SkillAuditEvent,
  type SkillHubReadiness,
  type SkillRegistryItem,
  type RemoteRegistrySettings,
  type SkillPackageInput,
  type UserProfile,
} from "../api";
import { shouldReloadSessionFromAgentEvent } from "../chat-stream-state";
import { appRouteFromPathname, appRoutePath, type AppRoute } from "../app-route";
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
import type { AppView, LoadState, SessionSummaryTitleMap, StreamState } from "./types";
import { agentDraftFromProfile } from "../features/agents/lib/agent-profile";
import {
  sortSessionsByRecent,
  sortSessionsForSidebar,
  streamLabel,
} from "../features/chat/lib/chat-format";
import { LandingPage } from "../pages/LandingPage";
import { WorkspaceTopBar } from "../components/workspace/WorkspaceTopBar";
import { ChatView } from "../components/workspace/views/ChatView";
import { AgentView } from "../components/workspace/views/AgentView";
import { SkillsView } from "../components/workspace/views/SkillsView";
import { mockSkills, mockSkillAgents, mockSkillAuditEvents } from "../mockSkillHub";
import { BuilderView } from "../components/workspace/views/BuilderView";
import { SettingsView } from "../components/workspace/views/SettingsView";

/** Skill 生命周期操作状态（原定义于 Skill Hub 页面，抽到此处以解耦视图组件）。 */
export type SkillLifecycleOperationState = { skillId: string; kind: "primary" | "rollback" };

export function App() {
  const initialSettingsSection = typeof window === "undefined" ? null : settingsSectionFromHash(window.location.hash);
  const [route, setRoute] = useState<AppRoute>(() =>
    typeof window === "undefined" ? "workspace" : appRouteFromPathname(window.location.pathname),
  );
  const [theme, setTheme] = useState<ThemeMode>(() =>
    typeof window === "undefined" ? "dark" : readStoredTheme(window.localStorage),
  );
  const [view, setView] = useState<AppView>(initialSettingsSection ? "settings" : "agent");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(initialSettingsSection ?? "profile");
  const [builderConfig, setBuilderConfig] = useState<AgentBuilderConfig>(() =>
    typeof window === "undefined" ? readAgentBuilderConfig(null) : readAgentBuilderConfig(window.localStorage),
  );
  const [skillRegistry, setSkillRegistry] = useState<SkillRegistryItem[]>([]);
  const [skillAuditEvents, setSkillAuditEvents] = useState<SkillAuditEvent[]>([]);
  const [skillHubReadiness, setSkillHubReadiness] = useState<SkillHubReadiness | null>(null);
  const [skillRegistrySettings, setSkillRegistrySettings] = useState<RemoteRegistrySettings | null>(null);
  const [skillRegistryRefreshing, setSkillRegistryRefreshing] = useState(false);
  const [skillOperationInFlight, setSkillOperationInFlight] = useState<SkillLifecycleOperationState | null>(null);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [agentDraft, setAgentDraft] = useState<AgentProfileInput>(defaultAgentProfileInput);
  const [isNewAgentDraft, setIsNewAgentDraft] = useState(false);
  const [agentSaving, setAgentSaving] = useState(false);
  const [agentSkillPreflight, setAgentSkillPreflight] = useState<AgentSkillPreflightResult | null>(null);
  const [agentSkillPreflightLoading, setAgentSkillPreflightLoading] = useState(false);
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
  const [topQuery, setTopQuery] = useState("");
  const [skillUploadOpen, setSkillUploadOpen] = useState(false);
  const activeSessionIdRef = useRef<string | null>(null);
  const streamingSessionIdRef = useRef<string | null>(null);
  const skillRegistryRefreshingRef = useRef(false);
  const skillOperationInFlightRef = useRef<SkillLifecycleOperationState | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeSummary = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );
  const activeAgent = useMemo(() => agents.find((agent) => agent.id === activeAgentId) ?? null, [activeAgentId, agents]);
  const installedSkillCount = useMemo(
    () => skillRegistry.filter((skill) => skill.installed).length,
    [skillRegistry],
  );
  const installedSkills = useMemo(() => skillRegistry.filter((skill) => skill.installed), [skillRegistry]);
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
  const isAgentView = view === "agent";
  const isSkillsView = view === "skills";
  const isBuilderView = view === "builder";
  const isChatView = view === "chat";
  const isLandingRoute = route === "landing";
  const conversationRuntimeState = loadState === "loading" ? "loading" : isBusy ? "running" : activeSessionId ? "completed" : "idle";

  function sessionTitleFor(session: SessionSummary | SessionDetail): string {
    const generatedTitle =
      activeSession?.id === session.id ? activeSessionSummaryTitle : sessionSummaryTitles[session.id] ?? null;
    return sessionDisplayTitle(session, sessionMetadata, generatedTitle);
  }

  function runtimeContextFromAgent(agent: AgentProfile | null): AgentRuntimeContext | null {
    return agent
      ? {
          id: agent.id,
          name: agent.name,
          skills: agent.skills,
        }
      : null;
  }

  function runtimeContextFromDraft(): AgentRuntimeContext {
    return {
      id: activeAgent?.id ?? "draft-agent",
      name: agentDraft.name,
      skills: agentDraft.skills,
    };
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
    let nextAgents = await fetchAgents();
    // Dev preview only: when the live BFF has no agents, fall back to mock agents so the
    // Skill Hub "used by" section is populated. Does not affect the Agent tab design (empty state).
    if (process.env.NODE_ENV !== "production" && nextAgents.length === 0) {
      nextAgents = mockSkillAgents;
    }
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

  async function refreshSkills(): Promise<void> {
    if (skillRegistryRefreshingRef.current) {
      return;
    }
    skillRegistryRefreshingRef.current = true;
    setSkillRegistryRefreshing(true);
    // Dev preview: skip all BFF calls so Skill Hub renders with mock data even without a live BFF.
    if (process.env.NODE_ENV !== "production") {
      const { normalizeSkillRegistryItem, normalizeSkillAuditEvent } = await import("../api");
      setSkillRegistry(mockSkills.map(normalizeSkillRegistryItem).filter((s) => s.id));
      setSkillAuditEvents(mockSkillAuditEvents.map(normalizeSkillAuditEvent).filter((e) => e.skillId));
      setSkillHubReadiness({ status: "ready", registry: { url: "", managedByService: false, lastSyncedAt: null, lastSyncError: "", skillCount: mockSkills.length }, store: { readable: true, message: "dev mock" } });
      skillRegistryRefreshingRef.current = false;
      setSkillRegistryRefreshing(false);
      return;
    }
    try {
      const nextRegistrySettings = await syncSkillRegistry();
      const [nextSkills, nextAuditEvents, nextReadiness] = await Promise.all([
        fetchSkills(),
        fetchSkillAuditEvents(),
        fetchSkillHubReadiness(),
      ]);
      setSkillRegistrySettings(nextRegistrySettings);
      setSkillHubReadiness(nextReadiness);
      setSkillRegistry(nextSkills);
      setSkillAuditEvents(nextAuditEvents);
    } finally {
      skillRegistryRefreshingRef.current = false;
      setSkillRegistryRefreshing(false);
    }
  }

  async function refreshSkillAuditEvents(): Promise<void> {
    setSkillAuditEvents(await fetchSkillAuditEvents());
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
    const skillsResult = refreshSkills();
    const runtimeResultsPromise = Promise.allSettled([refreshHealth(), refreshSessions(true)]);
    const businessResultsPromise = Promise.allSettled([profileResult, agentResult, skillsResult]);
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
      const session = await createSession(runtimeContextFromAgent(activeAgent));
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
      await sendSessionMessageStream(
        activeSessionId,
        message,
        (event) => {
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
        },
        runtimeContextFromAgent(activeAgent),
      );
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
    setRoute("workspace");
    if (window.location.pathname !== appRoutePath("workspace")) {
      window.history.pushState("", document.title, `${appRoutePath("workspace")}#settings/${section}`);
      return;
    }
    window.location.hash = `settings/${section}`;
  }

  function backToChat(): void {
    setView("chat");
    if (window.location.hash.startsWith("#settings")) {
      window.history.pushState("", document.title, window.location.pathname + window.location.search);
    }
  }

  function openWorkspace(initialView: AppView = "agent"): void {
    setRoute("workspace");
    setView(initialView);
    if (window.location.pathname !== appRoutePath("workspace") || window.location.hash) {
      window.history.pushState("", document.title, appRoutePath("workspace"));
    }
  }

  function updateBuilderConfig(config: AgentBuilderConfig): void {
    setBuilderConfig(config);
    writeAgentBuilderConfig(window.localStorage, config);
  }

  async function handleRefreshSkillRegistry(): Promise<void> {
    try {
      await refreshSkills();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function beginSkillOperation(operation: SkillLifecycleOperationState): boolean {
    if (skillOperationInFlightRef.current) {
      return false;
    }
    skillOperationInFlightRef.current = operation;
    setSkillOperationInFlight(operation);
    return true;
  }

  function endSkillOperation(operation: SkillLifecycleOperationState): void {
    const current = skillOperationInFlightRef.current;
    if (current?.skillId === operation.skillId && current.kind === operation.kind) {
      skillOperationInFlightRef.current = null;
      setSkillOperationInFlight(null);
    }
  }

  async function handleSkillAction(skill: SkillRegistryItem, version: string = skill.availableVersion || skill.version): Promise<void> {
    const operation: SkillLifecycleOperationState = { skillId: skill.id, kind: "primary" };
    if (!beginSkillOperation(operation)) {
      return;
    }

    // Dev preview: with no live BFF, simulate install / update / uninstall locally so the UI reacts.
    if (process.env.NODE_ENV !== "production") {
      setSkillRegistry((current) =>
        current.map((item) => {
          if (item.id !== skill.id) return item;
          if (skill.installed) {
            return {
              ...item,
              installed: false,
              status: "available" as const,
              installedVersion: "",
              previousInstalledVersion: item.installedVersion,
            };
          }
          return {
            ...item,
            installed: true,
            status: "installed" as const,
            installedVersion: version,
            previousInstalledVersion: item.installedVersion || "",
            availableVersion: version,
          };
        }),
      );
      setSkillAuditEvents((current) => [
        {
          id: `local-${Date.now()}`,
          action: skill.installed ? "uninstall" : "install",
          ok: true,
          code: "OK",
          message: "dev 模拟",
          skillId: skill.id,
          skillName: skill.name,
          version,
          status: skill.installed ? "available" : "installed",
          at: Date.now(),
        },
        ...current,
      ]);
      endSkillOperation(operation);
      return;
    }

    try {
      const nextSkill =
        skill.status === "available"
          ? await downloadSkill(skill.id)
          : skill.status === "updateAvailable"
            ? await updateSkill(skill.id)
          : skill.installed
            ? await uninstallSkill(skill.id)
            : await installSkill(skill.id);
      setSkillRegistry((current) => current.map((item) => (item.id === skill.id ? nextSkill : item)));
      await refreshSkillAuditEvents();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      endSkillOperation(operation);
    }
  }

  async function handleUploadSkillPackage(input: SkillPackageInput): Promise<void> {
    try {
      const nextSkill = await uploadSkillPackage(input);
      setSkillRegistry((current) => {
        const exists = current.some((skill) => skill.id === nextSkill.id);
        return exists ? current.map((skill) => (skill.id === nextSkill.id ? nextSkill : skill)) : [...current, nextSkill];
      });
      await refreshSkillAuditEvents();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function normalizedAgentDraftForSave(): AgentProfileInput {
    if (skillRegistry.length === 0) {
      return agentDraft;
    }
    const installedById = new Map(installedSkills.map((skill) => [skill.id, skill]));
    const skillIds = agentDraft.skillIds.filter((skillId) => installedById.has(skillId));
    return {
      ...agentDraft,
      skillIds,
      skills: skillIds.map((skillId) => {
        const skill = installedById.get(skillId);
        return {
          skillId,
          version: skill?.installedVersion || skill?.version || "",
          sourceType: skill?.sourceType ?? "builtin",
          registrySource: skill?.registrySource ?? "local",
        };
      }),
    };
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
    setAgentSkillPreflight(null);
    setIsNewAgentDraft(false);
  }

  function openAgentConfig(agent: AgentProfile): void {
    selectAgent(agent);
    setView("agent");
  }

  function handleCreateAgent(): void {
    setActiveAgentId(null);
    setAgentDraft({
      ...defaultAgentProfileInput,
      name: `新 Agent ${agents.length + 1}`,
    });
    setAgentSkillPreflight(null);
    setIsNewAgentDraft(true);
    setView("agent");
    setAgentError(null);
  }

  function handleAgentDraftChange(nextDraft: AgentProfileInput): void {
    setAgentDraft(nextDraft);
    setAgentSkillPreflight(null);
  }

  async function handleResolveAgentSkills(): Promise<void> {
    setAgentSkillPreflightLoading(true);
    try {
      setAgentSkillPreflight(await resolveAgentSkills(runtimeContextFromDraft()));
      setAgentError(null);
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : String(err));
    } finally {
      setAgentSkillPreflightLoading(false);
    }
  }

  async function handleSaveAgent(): Promise<void> {
    if (!activeAgent && !isNewAgentDraft) {
      return;
    }
    setAgentSaving(true);
    try {
      const draftToSave = normalizedAgentDraftForSave();
      const agent = activeAgent
        ? await updateAgentProfile(activeAgent.id, draftToSave)
        : await createAgentProfile(draftToSave);
      setAgents((current) =>
        activeAgent ? current.map((item) => (item.id === agent.id ? agent : item)) : [agent, ...current],
      );
      setActiveAgentId(agent.id);
      setAgentDraft(agentDraftFromProfile(agent));
      setAgentSkillPreflight(null);
      setIsNewAgentDraft(false);
      setView("agent");
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
      setAgentSkillPreflight(null);
      setIsNewAgentDraft(false);
      setView("agent");
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
    setAgentSkillPreflight(null);
    setIsNewAgentDraft(false);
    setAgentError(null);
    setView("agent");
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
    function handlePopState(): void {
      const nextRoute = appRouteFromPathname(window.location.pathname);
      setRoute(nextRoute);
      if (nextRoute === "workspace") {
        const nextSection = settingsSectionFromHash(window.location.hash);
        if (nextSection) {
          setSettingsSection(nextSection);
          setView("settings");
          return;
        }
        setView((current) => (current === "settings" ? "chat" : current));
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
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

  const topMeta: { title: string; sub: string; primary: string; onPrimary: () => void } = (() => {
    switch (view) {
      case "chat":
        return {
          title: activeSession?.title ?? (activeAgent ? `与 ${activeAgent.name} 对话` : "测试聊天"),
          sub: `${streamLabel(streamState)} · ${health?.status === "ok" ? "运行时已就绪" : "运行时异常"}`,
          primary: "新建会话",
          onPrimary: () => void handleCreateSession(),
        };
      case "agent":
        return {
          title: "Agent 管理",
          sub: `${agents.length} 个草稿 · ${installedSkillCount} 个已安装技能`,
          primary: "新建 Agent",
          onPrimary: () => void handleCreateAgent(),
        };
      case "skills":
        return {
          title: "技能市场",
          sub: `${skillRegistry.length} 个技能 · ${installedSkillCount} 已安装 · ${skillRegistry.filter((s) => s.status === "updateAvailable").length} 可更新`,
          primary: "上传技能包",
          onPrimary: () => setSkillUploadOpen(true),
        };
      case "builder":
        return {
          title: "Agent Builder",
          sub: "可视化构建 · 本地持久化",
          primary: "保存草稿",
          onPrimary: () => updateBuilderConfig(builderConfig),
        };
      case "settings":
        return {
          title: "设置",
          sub: "个人资料 · 偏好 · 系统",
          primary: "保存更改",
          onPrimary: () => void saveProfile(),
        };
      default:
        return { title: "", sub: "", primary: "", onPrimary: () => {} };
    }
  })();

  if (isLandingRoute) {
    return <LandingPage onStart={() => openWorkspace("agent")} />;
  }

  return (
    <div className="orbit-studio">
      <div className="shell">
        <AppSidebar
        view={view}
        health={health}
        sessions={visibleSessions}
        activeSessionId={activeSessionId}
        sessionMetadata={sessionMetadata}
        sessionTitleFor={sessionTitleFor}
        agents={agents}
        activeAgentId={activeAgentId}
        installedSkills={installedSkills}
        onNavigate={setView}
        onSelectSession={(sessionId) => {
          setView("chat");
          setActiveSessionId(sessionId);
        }}
        onSelectAgent={selectAgent}
        onOpenSettings={openSettings}
      />
      <main className="main">
        <WorkspaceTopBar
          title={topMeta.title}
          sub={topMeta.sub}
          primary={topMeta.primary}
          query={topQuery}
          onQueryChange={setTopQuery}
          onPrimary={topMeta.onPrimary}
        />
        <div className="view">
          <ChatView
            active={isChatView}
            activeAgent={activeAgent}
            activeSession={activeSession}
            activeSessionId={activeSessionId}
            messages={messages}
            draft={draft}
            canSend={canSend}
            isBusy={isBusy}
            error={error}
            streamState={streamState}
            health={health}
            textareaRef={textareaRef}
            onDraftChange={setDraft}
            onSend={(event) => void handleSend(event)}
            onComposerKeyDown={handleComposerKeyDown}
            onCreateSession={() => void handleCreateSession()}
            onBootstrap={() => void bootstrap()}
          />
          <AgentView
            active={isAgentView}
            agents={agents}
            activeAgentId={activeAgentId}
            onSelectAgent={selectAgent}
            draft={agentDraft}
            activeAgent={activeAgent}
            isNewDraft={isNewAgentDraft}
            error={agentError}
            saving={agentSaving}
            installedSkills={installedSkills}
            skillPreflight={agentSkillPreflight}
            skillPreflightLoading={agentSkillPreflightLoading}
            onDraftChange={handleAgentDraftChange}
            onResolveAgentSkills={() => void handleResolveAgentSkills()}
            onSaveAgent={() => void handleSaveAgent()}
            onDiscardDraft={discardAgentDraft}
            onDeleteAgent={(agent) => void handleDeleteAgent(agent)}
            onNewAgent={() => void handleCreateAgent()}
            onRefresh={() => void refreshAgentsSafely(true)}
          />
          <SkillsView
            active={isSkillsView}
            skills={skillRegistry}
            agents={agents}
            auditEvents={skillAuditEvents}
            query={topQuery}
            registryRefreshing={skillRegistryRefreshing}
            uploadOpen={skillUploadOpen}
            onUploadOpenChange={setSkillUploadOpen}
            onSkillAction={(skill, version) => void handleSkillAction(skill, version)}
            onUploadPackage={(input) => void handleUploadSkillPackage(input)}
            onRefreshRegistry={() => void handleRefreshSkillRegistry()}
          />
          <BuilderView
            active={isBuilderView}
            config={builderConfig}
            onConfigChange={updateBuilderConfig}
            onSaveDraft={() => updateBuilderConfig(builderConfig)}
          />
          <SettingsView
            active={isSettingsView}
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
        </div>
      </main>
      </div>
    </div>
  );
}
